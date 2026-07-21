import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Deliberately narrower than /api/admin/club-model: an invitee filling out
// the join form isn't logged into any account, so this is gated by a valid
// invite token rather than identity, and it never returns members or other
// invites — only what's needed to compute a pace-group/location/coach match.
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
  "scheduled_workouts",
] as const

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token")
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 })

    const admin = getAdminSupabase()
    const { data: invite } = await admin
      .from("club_model_invites")
      .select("status")
      .eq("token", token)
      .single()

    if (!invite || invite.status !== "sent") {
      return NextResponse.json({ error: "This invite link is no longer valid" }, { status: 404 })
    }

    const results = await Promise.all(TABLES.map((table) => admin.from(table).select("*")))
    const payload: Record<string, unknown> = {}
    TABLES.forEach((table, i) => {
      if (results[i].error) throw new Error(`${table}: ${results[i].error!.message}`)
      payload[table] = results[i].data
    })

    const { data: workoutRows } = await admin.from("runs").select("id, club_id, title, description, created_at").eq("kind", "workout")
    payload["workout_types"] = (workoutRows ?? []).map((r: any) => ({ ...r, name: r.title }))

    return NextResponse.json(payload)
  } catch (err: any) {
    console.error("join-data error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
