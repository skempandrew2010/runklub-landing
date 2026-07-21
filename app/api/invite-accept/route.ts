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

    // Look up invite — include preferred_region_id and name so we can enroll them
    const { data: invite } = await adminSupabase
      .from("member_invites")
      .select("id, club_id, email, name, status, preferred_region_id")
      .eq("token", token)
      .single()

    if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 })
    if (invite.status === "revoked") return NextResponse.json({ error: "This invite has been revoked" }, { status: 400 })
    if (invite.status === "accepted") return NextResponse.json({ ok: true, already: true })

    // Add to subscriptions as a paying member (director explicitly invited them)
    await adminSupabase
      .from("subscriptions")
      .upsert({ user_id: user.id, club_id: invite.club_id, member_type: "paid" }, { onConflict: "user_id,club_id" })

    // Enroll in the members table so they appear on the training schedule.
    // Use the name from the invite, falling back to their auth display name or email.
    if (invite.preferred_region_id) {
      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single()

      const memberName = invite.name || profile?.display_name || user.email || ""

      await adminSupabase
        .from("members")
        .upsert(
          {
            club_id: invite.club_id,
            user_id: user.id,
            email: user.email ?? invite.email,
            name: memberName,
            preferred_region_id: invite.preferred_region_id,
            status: "active",
          },
          { onConflict: "user_id,club_id", ignoreDuplicates: false }
        )
    }

    // Mark invite as accepted
    await adminSupabase
      .from("member_invites")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invite.id)

    return NextResponse.json({ ok: true, club_id: invite.club_id })
  } catch (err: any) {
    console.error("invite-accept error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
