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

    const { data: profile } = await getAdminSupabase()
      .from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { club_id, updates } = await req.json()
    if (!club_id) return NextResponse.json({ error: "club_id required" }, { status: 400 })
    if (!updates || typeof updates !== "object") return NextResponse.json({ error: "updates required" }, { status: 400 })

    const allowed = ["name", "city", "description", "instagram_handle", "contact_email", "website", "meeting_day", "meeting_time", "location", "latitude", "longitude", "is_public"]
    const safe: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in updates) safe[key] = updates[key]
    }

    const { error } = await getAdminSupabase()
      .from("clubs")
      .update(safe)
      .eq("id", club_id)

    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("update-club error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
