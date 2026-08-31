import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST /api/director/update-pace-group - director reassigns a member's pace
// group from the Members tab. subscriptions only has a self-only
// subscriptions_update_own RLS policy (user_id = auth.uid()), so a director's
// browser session can't update someone else's row directly - same reason
// remove-member/invite-member/approve-member/add-member all go through the
// service role instead of a raw client-side .update().
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const admin = getAdminSupabase()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { subscription_id, pace_group_id } = await req.json()
    if (!subscription_id) return NextResponse.json({ error: "subscription_id is required" }, { status: 400 })

    const { data: sub } = await admin
      .from("subscriptions")
      .select("id, club_id")
      .eq("id", subscription_id)
      .single()

    if (!sub) return NextResponse.json({ error: "Member not found" }, { status: 404 })

    const { data: club } = await admin
      .from("clubs")
      .select("id")
      .eq("id", sub.club_id)
      .eq("user_id", user.id)
      .single()

    if (!club) return NextResponse.json({ error: "Klub not found or unauthorized" }, { status: 403 })

    const { error } = await admin
      .from("subscriptions")
      .update({ pace_group_id: pace_group_id || null })
      .eq("id", subscription_id)

    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("update-pace-group error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
