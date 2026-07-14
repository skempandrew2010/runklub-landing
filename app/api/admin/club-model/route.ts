import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { TEST_MANAGER_USER_ID, TEST_MEMBER_USER_ID } from "@/lib/clubModel/testAccounts"
import { getClubModelTier } from "@/lib/clubModel/tierGate"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const TABLES = [
  "regions",
  "region_days",
  "region_day_times",
  "locations",
  "coaches",
  "location_coaches",
  "pace_groups",
  "pace_options",
  "training_schedules",
  "training_schedule_regions",
  "workout_types",
  "scheduled_workouts",
  "members",
  "club_model_invites",
  "run_rsvps",
] as const

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
    const isAdmin = profile?.role === "admin"
    const isTestAccount = user.id === TEST_MANAGER_USER_ID || user.id === TEST_MEMBER_USER_ID
    if (!isAdmin && !isTestAccount) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (!isAdmin && !(await getClubModelTier(admin))) {
      return NextResponse.json({ error: "This club needs a Starter, Pro, or Premium plan" }, { status: 403 })
    }

    const results = await Promise.all(TABLES.map((table) => admin.from(table).select("*")))
    const payload: Record<string, unknown> = {}
    TABLES.forEach((table, i) => {
      if (results[i].error) throw new Error(`${table}: ${results[i].error!.message}`)
      payload[table] = results[i].data
    })

    return NextResponse.json(payload)
  } catch (err: any) {
    console.error("club-model GET error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
