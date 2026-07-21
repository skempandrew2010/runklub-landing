import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST /api/director/add-member — add an existing RunKlub user to a club directly
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const adminSupabase = getAdminSupabase()
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { club_id, email, member_type = "free", region_id } = body ?? {}

    if (!club_id || !email) {
      return NextResponse.json({ error: "club_id and email are required" }, { status: 400 })
    }

    // Verify the caller owns the club
    const { data: club } = await adminSupabase
      .from("clubs")
      .select("id")
      .eq("id", club_id)
      .eq("user_id", user.id)
      .single()

    if (!club) return NextResponse.json({ error: "Unauthorized" }, { status: 403 })

    // Look up the target user by email via SECURITY DEFINER function
    const { data: targetUserId, error: lookupErr } = await adminSupabase
      .rpc("director_find_user_by_email", { p_email: email.trim().toLowerCase() })

    if (lookupErr) return NextResponse.json({ error: "User lookup failed" }, { status: 500 })
    if (!targetUserId) return NextResponse.json({ error: "No RunKlub account found for that email" }, { status: 404 })

    // Don't add yourself
    if (targetUserId === user.id) {
      return NextResponse.json({ error: "You can't add yourself as a member" }, { status: 400 })
    }

    // Upsert — idempotent if they're already a member
    const { error: subErr } = await adminSupabase
      .from("subscriptions")
      .upsert({ user_id: targetUserId, club_id, member_type }, { onConflict: "user_id,club_id" })

    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })

    // Return the new member's profile for immediate UI update
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", targetUserId)
      .single()

    // Store branch assignment in members table (club model) if a region was specified
    if (region_id) {
      const memberName = profile?.display_name || email.trim()
      await adminSupabase.from("members").upsert(
        { club_id, user_id: targetUserId, email: email.trim().toLowerCase(), name: memberName, preferred_region_id: region_id, status: "active" },
        { onConflict: "user_id,club_id", ignoreDuplicates: false }
      )
    }

    return NextResponse.json({ ok: true, user_id: targetUserId, profile })
  } catch (err: any) {
    console.error("add-member error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
