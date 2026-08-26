import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function toDateString(d: Date) {
  return d.toISOString().slice(0, 10)
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

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

    const today = new Date()
    const nextFollowup = new Date(today)
    nextFollowup.setDate(nextFollowup.getDate() + 5)

    const last_touch_date = toDateString(today)
    const next_followup_date = toDateString(nextFollowup)

    const { error } = await getAdminSupabase()
      .from("contacts")
      .update({ last_touch_date, next_followup_date })
      .eq("id", id)

    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true, last_touch_date, next_followup_date })
  } catch (err: any) {
    console.error("crm/mark-contacted error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
