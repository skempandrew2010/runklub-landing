import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"

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

      // ── Pro subscription renewed, updated, or payment failed ──
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription

        const { data: club } = await getSupabaseAdmin()
          .from("clubs")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle()

        if (!club) break

        const isActive = ["active", "trialing"].includes(sub.status)
        await getSupabaseAdmin().from("clubs").update({
          tier: isActive ? "pro" : "free",
          stripe_subscription_status: sub.status,
          tier_expires_at: (sub as any).current_period_end
            ? new Date((sub as any).current_period_end * 1000).toISOString()
            : null,
        }).eq("id", club.id)
        break
      }

      // ── Pro subscription cancelled ──
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription

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
