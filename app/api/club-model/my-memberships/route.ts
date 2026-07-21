import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { resolveMemberContext } from "@/lib/clubModel/resolveMemberContext"
import { resolveClubWeekSchedule } from "@/lib/clubModel/resolveWeekSchedule"
import { currentWeekMonday } from "@/lib/clubModel/week"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Real-identity, production-facing endpoint (unlike everything under
// /api/admin/club-model, which is locked to admins + the two hardcoded test
// accounts). Any authenticated user can call this — it just returns whatever
// active `members` rows have their own user_id, which today can only ever be
// the one seeded test club's roster, but doesn't hardcode that assumption.
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const admin = getAdminSupabase()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: members } = await admin
      .from("members")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")

    if (!members || members.length === 0) return NextResponse.json({ memberships: [] })

    const [
      { data: clubs },
      { data: pace_groups },
      { data: regions },
      { data: coaches },
      { data: locations },
      { data: training_schedules },
      { data: training_schedule_regions },
      { data: region_days },
      { data: region_day_times },
      { data: scheduled_workouts },
      { data: workout_types },
    ] = await Promise.all([
      admin.from("clubs").select("id, name, image_url"),
      admin.from("pace_groups").select("*"),
      admin.from("regions").select("*"),
      admin.from("coaches").select("*"),
      admin.from("locations").select("*"),
      admin.from("training_schedules").select("*"),
      admin.from("training_schedule_regions").select("*"),
      admin.from("region_days").select("*"),
      admin.from("region_day_times").select("*"),
      admin.from("scheduled_workouts").select("*"),
      admin.from("runs").select("id, club_id, title, description, created_at").eq("kind", "workout"),
    ])

    const scheduleData = {
      pace_groups: pace_groups ?? [],
      regions: regions ?? [],
      locations: locations ?? [],
      training_schedules: training_schedules ?? [],
      training_schedule_regions: training_schedule_regions ?? [],
      region_days: region_days ?? [],
      region_day_times: region_day_times ?? [],
      scheduled_workouts: scheduled_workouts ?? [],
      workout_types: (workout_types ?? []).map((r: any) => ({ ...r, name: r.title })),
    }
    const allSchedule = resolveClubWeekSchedule(scheduleData, currentWeekMonday())

    const memberships = members.map((member) => {
      const club = clubs?.find((c) => c.id === member.club_id) ?? null
      const context = resolveMemberContext(member, {
        pace_groups: pace_groups ?? [],
        regions: regions ?? [],
        coaches: coaches ?? [],
      })
      const weekSchedule = allSchedule.filter(
        (e) => e.paceGroup.id === member.pace_group_id && e.region.id === member.preferred_region_id
      )
      return { member, club, ...context, weekSchedule }
    })

    return NextResponse.json({ memberships })
  } catch (err: any) {
    console.error("my-memberships error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
