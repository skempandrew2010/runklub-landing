import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { PASSPORT_TIER_PRICE_ENV } from "@/lib/passportStripe"

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!) }

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/passport/checkout — starts a platform-level Checkout Session for
// one of the 4 Passport credit tiers. Platform-level (like /api/stripe/checkout
// for klub SaaS plans), not Connect-scoped: the runner pays RunKlub directly,
// since a Passport subscriber isn't paying for any one klub — payouts to the
// klubs they actually check into happen separately, per check-in, via
// /api/passport/checkin's Stripe Transfer.
export async function POST(req: NextRequest) {
  try {
    const { tier } = await req.json()
    if (![1, 2, 3, 4].includes(tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 })
    }

    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = getSupabaseAdmin()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const priceId = PASSPORT_TIER_PRICE_ENV[tier]
    if (!priceId) {
      console.error(`Stripe price ID not configured for Passport tier ${tier}`)
      return NextResponse.json({ error: "Pricing not yet configured for this tier — contact support" }, { status: 500 })
    }

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
    } else {
      // Same "don't trust our own DB alone" guard as /api/stripe/checkout —
      // a delayed/failed webhook could leave passport_subscriptions stale.
      const existingSubs = await getStripe().subscriptions.list({ customer: customerId, limit: 100 })
      const duplicate = existingSubs.data.find(
        (sub) => sub.metadata?.passportProgram === "true" && ["active", "trialing", "past_due"].includes(sub.status)
      )
      if (duplicate) {
        return NextResponse.json(
          { error: "You already have an active Passport subscription. Manage or change your plan from your billing portal instead of starting a new checkout." },
          { status: 400 }
        )
      }
    }

    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { passportProgram: "true", tier: String(tier), userId: user.id },
      subscription_data: { metadata: { passportProgram: "true", tier: String(tier), userId: user.id } },
      success_url: `${appUrl}/profile?passport_subscribed=1`,
      cancel_url: `${appUrl}/profile?passport_cancelled=1`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error("Passport checkout error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
