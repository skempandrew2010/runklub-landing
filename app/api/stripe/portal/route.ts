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
    const { returnPath, context } = await req.json()

    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = getSupabaseAdmin()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single()

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account found" }, { status: 404 })
    }

    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

    const allowedReturnPaths = ["/profile", "/dashboard", "/"]
    const safePath = allowedReturnPaths.includes(returnPath) ? returnPath : "/profile"
    const returnUrl = `${appUrl}${safePath}`

    // Deep-link straight into managing the relevant subscription instead of
    // Stripe's default portal, which lists every subscription this customer
    // has (a director's Pro plan and their own Passport plan can be on the
    // same Stripe customer) - "pro" and "passport" are two separate products
    // and the caller already knows which one this button is for.
    let subscriptionId: string | null = null
    if (context === "pro") {
      const { data: club } = await admin
        .from("clubs")
        .select("stripe_subscription_id")
        .eq("user_id", user.id)
        .not("stripe_subscription_id", "is", null)
        .order("created_at")
        .limit(1)
        .maybeSingle()
      subscriptionId = club?.stripe_subscription_id ?? null
    } else if (context === "passport") {
      const { data: sub } = await admin
        .from("passport_subscriptions")
        .select("stripe_subscription_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle()
      subscriptionId = sub?.stripe_subscription_id ?? null
    }

    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl,
      ...(subscriptionId
        ? { flow_data: { type: "subscription_update", subscription_update: { subscription: subscriptionId } } }
        : {}),
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (err) {
    console.error("Stripe portal error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
