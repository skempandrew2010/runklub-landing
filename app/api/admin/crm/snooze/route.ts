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

    const { data: contact, error: fetchError } = await getAdminSupabase()
      .from("contacts")
      .select("next_followup_date")
      .eq("id", id)
      .single()
    if (fetchError) throw new Error(fetchError.message)

    const base = contact?.next_followup_date ? new Date(`${contact.next_followup_date}T00:00:00Z`) : new Date()
    base.setUTCDate(base.getUTCDate() + 3)
    const next_followup_date = toDateString(base)

    const { error } = await getAdminSupabase()
      .from("contacts")
      .update({ next_followup_date })
      .eq("id", id)

    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true, next_followup_date })
  } catch (err: any) {
    console.error("crm/snooze error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
