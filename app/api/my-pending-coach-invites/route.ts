import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/my-pending-coach-invites — lets a signed-in user see their own
// pending coach invites (matched by email) so the app can surface them as a
// banner instead of relying on the recipient finding/clicking the email.
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const admin = getAdminSupabase()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user || !user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: invites } = await admin
      .from("coach_invites")
      .select("id, token, club_id, name, created_at, clubs(name, image_url)")
      .eq("status", "pending")
      .ilike("email", user.email)
      .order("created_at", { ascending: false })

    return NextResponse.json({ invites: invites ?? [] })
  } catch (err: any) {
    console.error("my-pending-coach-invites error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
