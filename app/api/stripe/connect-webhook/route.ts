import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!) }

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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
        const { clubId, userId } = session.metadata ?? {}
        if (!clubId || !userId || !session.subscription || !session.customer) break

        await getSupabaseAdmin().from("subscriptions").upsert({
          user_id: userId,
          club_id: clubId,
          member_type: "paid",
          stripe_subscription_id: session.subscription as string,
          stripe_customer_id: session.customer as string,
        }, { onConflict: "user_id,club_id" })
        break
      }

      // ── Subscription renewed, past due, or reactivated ──
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription
        const { clubId, userId } = sub.metadata ?? {}
        if (!clubId || !userId) break

        if (["active", "trialing"].includes(sub.status)) {
          await getSupabaseAdmin().from("subscriptions").upsert({
            user_id: userId,
            club_id: clubId,
            member_type: "paid",
            stripe_subscription_id: sub.id,
            stripe_customer_id: sub.customer as string,
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
