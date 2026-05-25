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

export async function POST(req: NextRequest) {
  try {
    const { clubId, tier } = await req.json()

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!clubId || !UUID_RE.test(clubId) || !tier || !["verified", "pro"].includes(tier)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    // Verify user identity from bearer token
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Verify the user owns this club
    const { data: club } = await getSupabaseAdmin()
      .from("clubs")
      .select("id, name, tier")
      .eq("id", clubId)
      .eq("user_id", user.id)
      .single()

    if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 })

    // Prevent downgrade via checkout
    if (club.tier === "pro") {
      return NextResponse.json({ error: "Club is already on Pro" }, { status: 400 })
    }
    if (club.tier === "verified" && tier === "verified") {
      return NextResponse.json({ error: "Club is already Verified" }, { status: 400 })
    }

    // Get or create a Stripe Customer for this user
    const { data: profile } = await getSupabaseAdmin()
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
      await getSupabaseAdmin()
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id)
    }

    const priceId = tier === "verified"
      ? process.env.STRIPE_VERIFIED_PRICE_ID!
      : process.env.STRIPE_PRO_PRICE_ID!

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { clubId, tier, userId: user.id },
      success_url: `${appUrl}/stripe/success?club_id=${clubId}&tier=${tier}`,
      cancel_url: `${appUrl}/stripe/cancel?club_id=${clubId}`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error("Stripe checkout error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
