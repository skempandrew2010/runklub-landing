import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!) }

// POST /api/director/remove-member — director removes a follower/member from
// their klub. Cancels the underlying Stripe subscription first if they were
// a paid member (so they stop being billed), then clears their subscription
// and any club-model roster (members table) row.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const admin = getAdminSupabase()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { subscription_id } = await req.json()
    if (!subscription_id) return NextResponse.json({ error: "subscription_id is required" }, { status: 400 })

    const { data: sub } = await admin
      .from("subscriptions")
      .select("id, user_id, club_id, member_type, stripe_subscription_id")
      .eq("id", subscription_id)
      .single()

    if (!sub) return NextResponse.json({ error: "Member not found" }, { status: 404 })

    const { data: club } = await admin
      .from("clubs")
      .select("id, stripe_connect_account_id")
      .eq("id", sub.club_id)
      .eq("user_id", user.id)
      .single()

    if (!club) return NextResponse.json({ error: "Klub not found or unauthorized" }, { status: 403 })

    let warning: string | undefined
    if (sub.member_type === "paid" && sub.stripe_subscription_id && club.stripe_connect_account_id) {
      try {
        await getStripe().subscriptions.cancel(sub.stripe_subscription_id, {}, { stripeAccount: club.stripe_connect_account_id })
      } catch (err: any) {
        console.error("remove-member stripe cancel error:", err)
        warning = "Removed, but couldn't cancel their Stripe subscription automatically — check Stripe directly."
      }
    }

    await admin.from("subscriptions").delete().eq("id", sub.id)
    await admin.from("members").delete().eq("club_id", sub.club_id).eq("user_id", sub.user_id)

    return NextResponse.json({ ok: true, warning })
  } catch (err: any) {
    console.error("remove-member error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
