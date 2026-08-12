import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { passportTierForPriceId } from "@/lib/passportStripe"

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!); }

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Must read raw body before any parsing — required for Stripe signature verification
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
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error("Webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    switch (event.type) {

      // ── One-time payment completed (Verified) or subscription checkout started (Pro) ──
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session

        // Passport credit subscription — distinguished from klub SaaS
        // checkout by metadata, since both share this one platform-level
        // webhook/secret. Only creates the subscriptions row; the first
        // credit batch is issued by invoice.paid below (same event that
        // fires on every renewal), not here, so there's exactly one place
        // that ever calls passport_issue_credits.
        if (session.metadata?.passportProgram === "true") {
          const { userId, tier } = session.metadata
          if (!userId || !tier || !session.subscription || !session.customer) break

          const admin = getSupabaseAdmin()
          const stripeSubId = session.subscription as string

          // Idempotent against Stripe's at-least-once webhook delivery (a
          // redelivered event re-updates the same row) and defensive against
          // a stale active row for this user from an earlier subscription
          // our webhook missed the cancellation of — either way, update
          // rather than insert, so we never hit the one-active-subscription-
          // per-user unique index.
          const { data: existing } = await admin
            .from("passport_subscriptions")
            .select("id")
            .or(`stripe_subscription_id.eq.${stripeSubId},and(user_id.eq.${userId},status.eq.active)`)
            .maybeSingle()

          if (existing) {
            await admin.from("passport_subscriptions").update({
              tier: Number(tier),
              status: "active",
              stripe_subscription_id: stripeSubId,
              stripe_customer_id: session.customer as string,
            }).eq("id", existing.id)
          } else {
            await admin.from("passport_subscriptions").insert({
              user_id: userId,
              tier: Number(tier),
              status: "active",
              stripe_subscription_id: stripeSubId,
              stripe_customer_id: session.customer as string,
            })
          }
          break
        }

        const { clubId, tier } = session.metadata ?? {}
        if (!clubId || !tier) break

        const updates: Record<string, unknown> = { tier }

        if (session.subscription) {
          updates.stripe_subscription_id = session.subscription as string
          updates.stripe_subscription_status = "active"
        }

        await getSupabaseAdmin().from("clubs").update(updates).eq("id", clubId)
        break
      }

      // ── Invoice paid — for Passport, this is the subscriber's billing
      //    date and the only trigger for issuing a credit batch (covers
      //    both the first payment and every renewal, so issuance never has
      //    to be duplicated in checkout.session.completed). ──
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = (invoice as any).subscription as string | null
        if (!subscriptionId) break

        const { data: passportSub } = await getSupabaseAdmin()
          .from("passport_subscriptions")
          .select("id, status")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle()

        if (!passportSub || passportSub.status !== "active") break

        const { error } = await getSupabaseAdmin().rpc("passport_issue_credits", { p_subscription_id: passportSub.id })
        if (error) console.error("passport_issue_credits failed for invoice.paid:", error)
        break
      }

      // ── Subscription renewed, plan-changed, or payment failed ──
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription

        if (sub.metadata?.passportProgram === "true") {
          const priceId = sub.items.data[0]?.price?.id
          const resolvedTier = passportTierForPriceId(priceId)
          const isActive = ["active", "trialing"].includes(sub.status)
          const updates: Record<string, unknown> = {
            status: isActive ? "active" : sub.status === "past_due" ? "past_due" : "canceled",
            current_period_start: (sub as any).current_period_start
              ? new Date((sub as any).current_period_start * 1000).toISOString() : null,
            current_period_end: (sub as any).current_period_end
              ? new Date((sub as any).current_period_end * 1000).toISOString() : null,
          }
          // A plan switch (upgrade/downgrade) takes effect at the next
          // billing date, not immediately — invoice.paid issues credits at
          // whatever tier is on the row *then*, so just keep the tier in
          // sync with Stripe's current price rather than issuing anything here.
          if (resolvedTier) updates.tier = resolvedTier
          await getSupabaseAdmin().from("passport_subscriptions").update(updates).eq("stripe_subscription_id", sub.id)
          break
        }

        const { data: club } = await getSupabaseAdmin()
          .from("clubs")
          .select("id, tier")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle()

        if (!club) break

        const isActive = ["active", "trialing"].includes(sub.status)

        // Read the tier from subscription metadata (set at checkout time).
        // Fall back to the club's current tier so a missing metadata value
        // never accidentally downgrades or changes the tier.
        const VALID_TIERS = ["starter", "growth", "enterprise"]
        const metaTier = (sub as any).metadata?.tier as string | undefined
        const resolvedTier = metaTier && VALID_TIERS.includes(metaTier) ? metaTier : club.tier

        await getSupabaseAdmin().from("clubs").update({
          tier: isActive ? resolvedTier : "free",
          stripe_subscription_status: sub.status,
          tier_expires_at: (sub as any).current_period_end
            ? new Date((sub as any).current_period_end * 1000).toISOString()
            : null,
        }).eq("id", club.id)
        break
      }

      // ── Subscription cancelled ──
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription

        if (sub.metadata?.passportProgram === "true") {
          // Already-issued, unexpired credit batches are left alone — they
          // remain spendable until their normal 45-day expiration.
          await getSupabaseAdmin().from("passport_subscriptions").update({
            status: "canceled",
            canceled_at: new Date().toISOString(),
          }).eq("stripe_subscription_id", sub.id)
          break
        }

        const { data: club } = await getSupabaseAdmin()
          .from("clubs")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle()

        if (!club) break

        await getSupabaseAdmin().from("clubs").update({
          tier: "free",
          stripe_subscription_status: "canceled",
          stripe_subscription_id: null,
          tier_expires_at: null,
        }).eq("id", club.id)
        break
      }
    }
  } catch (err) {
    console.error(`Error handling webhook event ${event.type}:`, err)
    return NextResponse.json({ error: "Handler failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
