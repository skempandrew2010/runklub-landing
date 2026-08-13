import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"

const FROM = process.env.RESEND_FROM_EMAIL ?? "RunKlub <info@runklub.fit>"

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!) }

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Fires once per brand-new paid signup (checkout.session.completed only
// happens at the start of a subscription, never on renewals — those go
// through customer.subscription.updated instead), so there's no risk of
// emailing the director every billing cycle.
async function notifyDirectorOfNewMember(clubId: string, memberUserId: string, priceCents: number | null, billingInterval: "monthly" | "yearly") {
  const admin = getSupabaseAdmin()
  const { data: club } = await admin.from("clubs").select("id, name, user_id").eq("id", clubId).single()
  if (!club) return

  const [{ data: memberProfile }, { data: directorUser }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", memberUserId).single(),
    admin.auth.admin.getUserById(club.user_id),
  ])

  const directorEmail = directorUser?.user?.email
  if (!directorEmail) return

  const memberName = memberProfile?.display_name || "A runner"
  const priceLine = priceCents ? `They're paying $${(priceCents / 100).toFixed(2)}/${billingInterval === "yearly" ? "yr" : "mo"}.` : ""

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM,
      to: directorEmail,
      subject: `${memberName} just became a paying member of ${club.name}`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a2110;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #2e3d1a;">
          <span style="font-size:20px;font-weight:900;color:#ffffff;">Run</span><span style="font-size:20px;font-weight:900;color:#c5f135;">Klub</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:900;color:#ffffff;">New paying member 🎉</h1>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.8);">
            <strong style="color:#ffffff;">${memberName}</strong> just subscribed to <strong style="color:#ffffff;">${club.name}</strong>. ${priceLine}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      text: `${memberName} just subscribed to ${club.name}. ${priceLine}`,
    })
  } catch (err) {
    console.error("notifyDirectorOfNewMember email error:", err)
  }
}

// Reverts a member to a plain (free) follower — used for both a subscription
// being canceled outright and one reaching a terminal unpaid state. Keeps
// the subscriptions row (so they stay a follower) rather than deleting it.
async function revertToFollower(subscriptionId: string) {
  await getSupabaseAdmin()
    .from("subscriptions")
    .update({ member_type: "community" })
    .eq("stripe_subscription_id", subscriptionId)
}

// Separate endpoint/signing secret from /api/stripe/webhook on purpose:
// Connect events (anything generated inside a connected account's namespace,
// plus account.updated) are a distinct Stripe delivery stream requiring their
// own Dashboard-registered "Connect" webhook endpoint.
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get("stripe-signature")

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error("Connect webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    switch (event.type) {

      // ── Connected account's onboarding/verification status changed ──
      case "account.updated": {
        const account = event.data.object as Stripe.Account
        await getSupabaseAdmin().from("clubs").update({
          stripe_connect_charges_enabled: !!account.charges_enabled,
          stripe_connect_payouts_enabled: !!account.payouts_enabled,
          stripe_connect_details_submitted: !!account.details_submitted,
        }).eq("stripe_connect_account_id", account.id)
        break
      }

      // ── Member's checkout completed — fast-path grant. Authoritative
      //    ongoing status still comes from customer.subscription.updated. ──
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const { clubId, userId, billingInterval, priceCents } = session.metadata ?? {}
        if (!clubId || !userId || !session.subscription || !session.customer) break

        const interval: "monthly" | "yearly" = billingInterval === "yearly" ? "yearly" : "monthly"
        const snapshotPrice = priceCents ? Number(priceCents) : null

        await getSupabaseAdmin().from("subscriptions").upsert({
          user_id: userId,
          club_id: clubId,
          member_type: "paid",
          stripe_subscription_id: session.subscription as string,
          stripe_customer_id: session.customer as string,
          billing_interval: interval,
          price_cents: snapshotPrice,
        }, { onConflict: "user_id,club_id" })

        await notifyDirectorOfNewMember(clubId, userId, snapshotPrice, interval)
        break
      }

      // ── Subscription renewed, past due, or reactivated ──
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription
        const { clubId, userId, billingInterval, priceCents } = sub.metadata ?? {}
        if (!clubId || !userId) break

        if (["active", "trialing"].includes(sub.status)) {
          await getSupabaseAdmin().from("subscriptions").upsert({
            user_id: userId,
            club_id: clubId,
            member_type: "paid",
            stripe_subscription_id: sub.id,
            stripe_customer_id: sub.customer as string,
            billing_interval: billingInterval === "yearly" ? "yearly" : "monthly",
            price_cents: priceCents ? Number(priceCents) : null,
          }, { onConflict: "user_id,club_id" })
        } else if (["canceled", "unpaid"].includes(sub.status)) {
          // past_due is deliberately not treated as terminal — Stripe is
          // still retrying the card; reverting on the first missed payment
          // would be overly punitive.
          await revertToFollower(sub.id)
        }
        break
      }

      // ── Subscription canceled outright ──
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription
        await revertToFollower(sub.id)
        break
      }
    }
  } catch (err) {
    console.error(`Error handling Connect webhook event ${event.type}:`, err)
    return NextResponse.json({ error: "Handler failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
