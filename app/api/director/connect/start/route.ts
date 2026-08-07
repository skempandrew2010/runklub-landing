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

// POST /api/director/connect/start — creates (or reuses) the klub's Express
// connected account and returns a fresh Account Link to redirect the
// director into Stripe's hosted onboarding. Account Links are single-use and
// short-lived, so this always mints a new one rather than caching.
export async function POST(req: NextRequest) {
  try {
    const { clubId } = await req.json()

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!clubId || !UUID_RE.test(clubId)) {
      return NextResponse.json({ error: "Invalid klub ID" }, { status: 400 })
    }

    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = getSupabaseAdmin()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: club } = await admin
      .from("clubs")
      .select("id, name, stripe_connect_account_id")
      .eq("id", clubId)
      .eq("user_id", user.id)
      .single()

    if (!club) return NextResponse.json({ error: "Klub not found" }, { status: 404 })

    let accountId = club.stripe_connect_account_id

    if (!accountId) {
      const account = await getStripe().accounts.create({
        type: "express",
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { clubId },
      })
      accountId = account.id
      await admin.from("clubs").update({ stripe_connect_account_id: accountId }).eq("id", clubId)
    }

    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

    const accountLink = await getStripe().accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/director?connect_refresh=1&club_id=${clubId}`,
      return_url: `${appUrl}/director?connect_return=1&club_id=${clubId}`,
      type: "account_onboarding",
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (err) {
    console.error("Stripe Connect onboarding error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
