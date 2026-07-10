import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const admin = getAdminSupabase()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await admin
      .from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { data: incomplete, error: profilesError } = await admin
      .from("profiles")
      .select("id, display_name, created_at, onboarding_complete, signup_reminder_sent_at")
      .not("onboarding_complete", "is", true)
      .order("created_at", { ascending: false })

    if (profilesError) throw new Error(profilesError.message)

    const rows = await Promise.all(
      (incomplete ?? []).map(async (p) => {
        const { data } = await admin.auth.admin.getUserById(p.id)
        return {
          id: p.id,
          display_name: p.display_name,
          created_at: p.created_at,
          signup_reminder_sent_at: p.signup_reminder_sent_at,
          email: data?.user?.email ?? null,
        }
      })
    )

    return NextResponse.json({ signups: rows.filter((r) => r.email) })
  } catch (err: any) {
    console.error("list signups error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
