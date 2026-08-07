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

// POST /api/director/connect/status — re-fetches the klub's connected account
// from Stripe and syncs charges_enabled/payouts_enabled/details_submitted.
// Called right when the director lands back from Stripe's hosted onboarding
// (the webhook alone isn't guaranteed to have arrived yet), and doubles as a
// manual "Refresh status" action.
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
      .select("id, stripe_connect_account_id")
      .eq("id", clubId)
      .eq("user_id", user.id)
      .single()

    if (!club) return NextResponse.json({ error: "Klub not found" }, { status: 404 })
    if (!club.stripe_connect_account_id) {
      return NextResponse.json({ error: "Stripe onboarding hasn't been started for this klub" }, { status: 400 })
    }

    const account = await getStripe().accounts.retrieve(club.stripe_connect_account_id)

    const updates = {
      stripe_connect_charges_enabled: !!account.charges_enabled,
      stripe_connect_payouts_enabled: !!account.payouts_enabled,
      stripe_connect_details_submitted: !!account.details_submitted,
    }

    await admin.from("clubs").update(updates).eq("id", clubId)

    return NextResponse.json(updates)
  } catch (err) {
    console.error("Stripe Connect status error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
