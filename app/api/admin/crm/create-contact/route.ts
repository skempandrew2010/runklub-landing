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

    const { club_name, contact_name, email, phone, source, notes } = await req.json()
    if (!club_name || !club_name.trim()) {
      return NextResponse.json({ error: "club_name is required" }, { status: 400 })
    }

    const { data, error } = await getAdminSupabase()
      .from("contacts")
      .insert({
        club_name: club_name.trim(),
        contact_name: contact_name?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        source: source?.trim() || null,
        notes: notes?.trim() || null,
        status: "cold",
      })
      .select("id, club_name, contact_name, email, phone, status, source, last_touch_date, next_followup_date, notes, created_at")
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true, contact: data })
  } catch (err: any) {
    console.error("crm/create-contact error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
