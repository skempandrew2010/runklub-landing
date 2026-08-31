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

const PACK_PRICE_CENTS = 600
const CREDITS_PER_PACK = 10

// POST /api/passport/buy-credits - one-time purchase of extra Passport
// credits on top of a runner's monthly plan, sold in $6.00 packs of 10
// credits with no cap on pack quantity. Same platform-level pattern as
// /api/passport/checkout; the resulting credit batch is issued by the
// checkout.session.completed handler in /api/stripe/webhook once payment
// actually completes, not here.
export async function POST(req: NextRequest) {
  try {
    const { packs, returnPath } = await req.json()
    if (!Number.isInteger(packs) || packs < 1) {
      return NextResponse.json({ error: "packs must be a whole number of 1 or more" }, { status: 400 })
    }
    const credits = packs * CREDITS_PER_PACK
    // Only ever used to build a same-origin redirect URL below - must stay a
    // relative path so this can't be turned into an open redirect.
    const safeReturnPath = typeof returnPath === "string" && returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/passport/credits"

    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = getSupabaseAdmin()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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
      mode: "payment",
      ui_mode: "embedded_page",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: PACK_PRICE_CENTS,
          product_data: { name: "RunKlub Passport Credit Pack (10 credits)" },
        },
        quantity: packs,
      }],
      payment_intent_data: {
        metadata: { passportCreditPurchase: "true", userId: user.id, credits: String(credits) },
      },
      metadata: { passportCreditPurchase: "true", userId: user.id, credits: String(credits) },
      return_url: `${appUrl}${safeReturnPath}${safeReturnPath.includes("?") ? "&" : "?"}purchased=1`,
    })

    return NextResponse.json({ clientSecret: session.client_secret })
  } catch (err) {
    console.error("Passport credit purchase error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
