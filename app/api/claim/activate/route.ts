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

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await getAdminSupabase().auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userEmail = user.email?.toLowerCase()
    if (!userEmail) return NextResponse.json({ error: "User has no email" }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const { club_id: requestedClubId } = body ?? {}

    // Find the approved claim for this user's email.
    // club_id is optional — if the URL param was lost in the Supabase redirect
    // we fall back to looking up the most recent approved claim by email alone.
    const { data: claim } = requestedClubId
      ? await getAdminSupabase()
          .from("club_claims")
          .select("id, status, club_id")
          .eq("contact_email", userEmail)
          .eq("club_id", requestedClubId)
          .eq("status", "approved")
          .maybeSingle()
      : await getAdminSupabase()
          .from("club_claims")
          .select("id, status, club_id")
          .eq("contact_email", userEmail)
          .eq("status", "approved")
          .order("claimed_at", { ascending: false })
          .limit(1)
          .maybeSingle()

    if (!claim) return NextResponse.json({ error: "No approved claim found" }, { status: 403 })

    const clubId = claim.club_id

    // Verify the club exists and isn't already owned by someone else
    const { data: club } = await getAdminSupabase()
      .from("clubs")
      .select("id, user_id")
      .eq("id", clubId)
      .single()

    if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 })
    if (club.user_id && club.user_id !== user.id) {
      return NextResponse.json({ error: "Club already has an owner" }, { status: 409 })
    }

    // Link the club, mark the token used, and grant manager role
    await Promise.all([
      getAdminSupabase()
        .from("clubs")
        .update({ user_id: user.id, claim_token_used_at: new Date().toISOString() })
        .eq("id", clubId),
      getAdminSupabase()
        .from("profiles")
        .upsert({ id: user.id, role: "manager" }, { onConflict: "id" }),
    ])

    return NextResponse.json({ ok: true, club_id: clubId })
  } catch (err: any) {
    console.error("claim/activate error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
