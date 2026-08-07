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

// POST /api/clubs/[clubId]/billing-portal — Connect-scoped analog of
// /api/stripe/portal: lets a paying member manage or cancel their klub
// membership. Runs against the klub's connected account, since that's where
// the member's Customer/Subscription actually live.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params

    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = getSupabaseAdmin()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: club } = await admin
      .from("clubs")
      .select("id, stripe_connect_account_id")
      .eq("id", clubId)
      .single()

    if (!club?.stripe_connect_account_id) {
      return NextResponse.json({ error: "This klub doesn't accept paid memberships" }, { status: 404 })
    }

    const { data: sub } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .eq("club_id", clubId)
      .maybeSingle()

    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account found for this klub" }, { status: 404 })
    }

    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

    const portalSession = await getStripe().billingPortal.sessions.create(
      {
        customer: sub.stripe_customer_id,
        return_url: `${appUrl}/clubs/${clubId}`,
      },
      { stripeAccount: club.stripe_connect_account_id }
    )

    return NextResponse.json({ url: portalSession.url })
  } catch (err) {
    console.error("Klub billing portal error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
