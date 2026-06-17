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

    const { club_id } = await req.json()
    if (!club_id) return NextResponse.json({ error: "club_id required" }, { status: 400 })

    // Verify the club exists, is approved, and isn't already owned
    const { data: club } = await getAdminSupabase()
      .from("clubs")
      .select("id, name, user_id")
      .eq("id", club_id)
      .single()

    if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 })
    if (club.user_id && club.user_id !== user.id) {
      return NextResponse.json({ error: "Club already has an owner" }, { status: 409 })
    }

    // Check the claim was approved for this email
    const { data: claim } = await getAdminSupabase()
      .from("club_claims")
      .select("id, status")
      .eq("club_id", club_id)
      .eq("contact_email", user.email)
      .eq("status", "approved")
      .maybeSingle()

    if (!claim) return NextResponse.json({ error: "No approved claim found" }, { status: 403 })

    // Link the club and grant manager role
    await Promise.all([
      getAdminSupabase().from("clubs").update({ user_id: user.id }).eq("id", club_id),
      getAdminSupabase()
        .from("profiles")
        .upsert({ id: user.id, role: "manager" }, { onConflict: "id" }),
    ])

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("claim/activate error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
