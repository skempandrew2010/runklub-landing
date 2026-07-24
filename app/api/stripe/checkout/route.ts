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

// Tiers the director can upgrade into, in ascending order.
const TIER_RANK: Record<string, number> = { free: 0, starter: 1, growth: 2, enterprise: 3 }

// Maps each paid tier to its Stripe price ID env var.
// STRIPE_PRO_PRICE_ID is kept as a fallback for existing growth deployments.
const TIER_PRICE_ENV: Record<string, string | undefined> = {
  starter:    process.env.STRIPE_STARTER_PRICE_ID,
  growth:     process.env.STRIPE_GROWTH_PRICE_ID ?? process.env.STRIPE_PRO_PRICE_ID,
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID,
}

export async function POST(req: NextRequest) {
  try {
    const { clubId, tier } = await req.json()

    // Validate inputs
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!clubId || !UUID_RE.test(clubId)) {
      return NextResponse.json({ error: "Invalid klub ID" }, { status: 400 })
    }
    if (!tier || !(tier in TIER_PRICE_ENV)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
    }

    // Verify caller identity
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = getSupabaseAdmin()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Verify the user owns this club
    const { data: club } = await admin
      .from("clubs")
      .select("id, name, tier")
      .eq("id", clubId)
      .eq("user_id", user.id)
      .single()

    if (!club) return NextResponse.json({ error: "Klub not found" }, { status: 404 })

    // Prevent downgrade or same-tier checkout
    const currentRank = TIER_RANK[club.tier as string] ?? 0
    const targetRank  = TIER_RANK[tier] ?? 0
    if (targetRank <= currentRank) {
      return NextResponse.json(
        { error: `Your klub is already on the ${club.tier} plan or higher` },
        { status: 400 }
      )
    }

    // Resolve price ID — fail loudly if not configured so ops can catch it
    const priceId = TIER_PRICE_ENV[tier]
    if (!priceId) {
      console.error(`Stripe price ID not configured for tier: ${tier}`)
      return NextResponse.json(
        { error: `Pricing not yet configured for the ${tier} plan — contact support` },
        { status: 500 }
      )
    }

    // Get or create a Stripe Customer for this user
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id, display_name")
      .eq("id", user.id)
      .single()

    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email,
        name: profile?.display_name ?? undefined,
        metadata: { user_id: user.id },
      })
      customerId = customer.id
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id)
    }

    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // metadata on the session itself (used by checkout.session.completed)
      metadata: { clubId, tier, userId: user.id },
      // metadata on the subscription so renewals (customer.subscription.updated)
      // can read the tier without re-querying the original session
      subscription_data: { metadata: { clubId, tier, userId: user.id } },
      success_url: `${appUrl}/stripe/success?club_id=${clubId}&tier=${tier}`,
      cancel_url:  `${appUrl}/stripe/cancel?club_id=${clubId}`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error("Stripe checkout error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
