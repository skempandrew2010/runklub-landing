import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const sessionToken = authHeader.replace("Bearer ", "")
    const adminSupabase = getAdminSupabase()
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(sessionToken)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { token } = await req.json()
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 })

    const { data: invite } = await adminSupabase
      .from("coach_invites")
      .select("id, club_id, email, name, status, pace_group_ids, region_ids")
      .eq("token", token)
      .single()

    if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 })
    if (invite.status === "revoked") return NextResponse.json({ error: "This invite has been revoked" }, { status: 400 })
    if (invite.status === "accepted") return NextResponse.json({ ok: true, already: true, club_id: invite.club_id })

    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single()

    const coachName = invite.name || profile?.display_name || user.email || "Coach"

    // Reactivate a previously-revoked coach row for this person if one
    // exists, otherwise create a new one.
    const { data: existing } = await adminSupabase
      .from("coaches")
      .select("id")
      .eq("club_id", invite.club_id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (existing) {
      await adminSupabase
        .from("coaches")
        .update({
          name: coachName,
          email: user.email ?? invite.email,
          pace_group_ids: invite.pace_group_ids,
          region_ids: invite.region_ids,
          status: "active",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
    } else {
      await adminSupabase.from("coaches").insert({
        club_id: invite.club_id,
        user_id: user.id,
        name: coachName,
        email: user.email ?? invite.email,
        pace_group_ids: invite.pace_group_ids,
        region_ids: invite.region_ids,
        status: "active",
        accepted_at: new Date().toISOString(),
      })
    }

    await adminSupabase
      .from("coach_invites")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invite.id)

    return NextResponse.json({ ok: true, club_id: invite.club_id })
  } catch (err: any) {
    console.error("coach-invite-accept error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
