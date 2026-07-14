import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Intentionally unauthenticated, same as invite-lookup — gated by a valid,
// not-yet-used invite token rather than by who's making the request.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, name, email, self_reported_pace, preferred_region_id, pace_group_id, location_id, coach_id } = body

    if (!token || !name || !email) {
      return NextResponse.json({ error: "token, name, and email are required" }, { status: 400 })
    }

    const admin = getAdminSupabase()
    const { data: invite } = await admin
      .from("club_model_invites")
      .select("id, club_id, status")
      .eq("token", token)
      .single()

    if (!invite || invite.status !== "sent") {
      return NextResponse.json({ error: "This invite link is no longer valid" }, { status: 404 })
    }

    const { data: member, error: insertError } = await admin
      .from("members")
      .insert({
        club_id: invite.club_id,
        name,
        email,
        self_reported_pace,
        preferred_region_id,
        pace_group_id,
        location_id,
        coach_id,
        user_id: null,
      })
      .select()
      .single()
    if (insertError) throw new Error(insertError.message)

    await admin
      .from("club_model_invites")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("id", invite.id)

    return NextResponse.json({ member })
  } catch (err: any) {
    console.error("accept-invite error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
