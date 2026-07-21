import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST /api/director/approve-member — approve or reject a membership request
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const adminSupabase = getAdminSupabase()
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { request_id, action } = body ?? {}

    if (!request_id || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "request_id and action (approve|reject) required" }, { status: 400 })
    }

    // Fetch the request and verify the director owns the club
    const { data: request } = await adminSupabase
      .from("membership_requests")
      .select("id, club_id, user_id, status")
      .eq("id", request_id)
      .eq("status", "pending")
      .single()

    if (!request) return NextResponse.json({ error: "Request not found or already reviewed" }, { status: 404 })

    const { data: club } = await adminSupabase
      .from("clubs")
      .select("id")
      .eq("id", request.club_id)
      .eq("user_id", user.id)
      .single()

    if (!club) return NextResponse.json({ error: "Unauthorized" }, { status: 403 })

    if (action === "approve") {
      // Add to subscriptions as a paying member
      await adminSupabase
        .from("subscriptions")
        .upsert({ user_id: request.user_id, club_id: request.club_id, member_type: "paid" }, { onConflict: "user_id,club_id" })

      // Mark request as approved
      await adminSupabase
        .from("membership_requests")
        .update({ status: "approved", reviewed_at: new Date().toISOString() })
        .eq("id", request_id)
    } else {
      await adminSupabase
        .from("membership_requests")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", request_id)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("approve-member error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
