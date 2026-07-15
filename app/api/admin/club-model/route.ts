import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ALL_TABLES = [
  "regions", "region_days", "region_day_times", "locations", "coaches",
  "location_coaches", "pace_groups", "pace_options", "training_schedules",
  "training_schedule_regions", "workout_types", "scheduled_workouts",
  "members", "club_model_invites", "run_rsvps",
] as const

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const admin = getAdminSupabase()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single()
    const isAdmin = profile?.role === "admin"

    const clubId = req.nextUrl.searchParams.get("club_id")

    if (!isAdmin) {
      if (!clubId) return NextResponse.json({ error: "club_id required" }, { status: 400 })
      const { data: club } = await admin.from("clubs").select("id, tier").eq("id", clubId).eq("user_id", user.id).single()
      if (!club) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      if (!["starter", "growth", "enterprise"].includes(club.tier ?? "")) {
        return NextResponse.json({ error: "This club needs a Starter, Growth, or Enterprise plan" }, { status: 403 })
      }
    }

    // Admin with no club_id: return all data (dev tool fallback)
    if (!clubId) {
      const results = await Promise.all(ALL_TABLES.map((table) => admin.from(table).select("*")))
      const payload: Record<string, unknown> = {}
      ALL_TABLES.forEach((table, i) => {
        if (results[i].error) throw new Error(`${table}: ${results[i].error!.message}`)
        payload[table] = results[i].data
      })
      return NextResponse.json(payload)
    }

    // Batch 1: tables with direct club_id column
    const [
      { data: regions, error: e1 },
      { data: coaches, error: e2 },
      { data: paceGroups, error: e3 },
      { data: paceOptions, error: e4 },
      { data: workoutTypes, error: e5 },
      { data: members, error: e6 },
    ] = await Promise.all([
      admin.from("regions").select("*").eq("club_id", clubId),
      admin.from("coaches").select("*").eq("club_id", clubId),
      admin.from("pace_groups").select("*").eq("club_id", clubId),
      admin.from("pace_options").select("*").eq("club_id", clubId),
      admin.from("workout_types").select("*").eq("club_id", clubId),
      admin.from("members").select("*").eq("club_id", clubId),
    ])

    for (const [name, err] of [
      ["regions", e1], ["coaches", e2], ["pace_groups", e3],
      ["pace_options", e4], ["workout_types", e5], ["members", e6],
    ] as [string, any][]) {
      if (err) throw new Error(`${name}: ${err.message}`)
    }

    const regionIds = (regions ?? []).map((r: any) => r.id)
    const paceGroupIds = (paceGroups ?? []).map((g: any) => g.id)
    const memberIds = (members ?? []).map((m: any) => m.id)

    // Batch 2: one level removed from club_id
    const [
      { data: locations, error: e7 },
      { data: regionDays, error: e8 },
      { data: trainingSchedules, error: e9 },
    ] = await Promise.all([
      regionIds.length > 0
        ? admin.from("locations").select("*").in("region_id", regionIds)
        : Promise.resolve({ data: [], error: null }),
      regionIds.length > 0
        ? admin.from("region_days").select("*").in("region_id", regionIds)
        : Promise.resolve({ data: [], error: null }),
      paceGroupIds.length > 0
        ? admin.from("training_schedules").select("*").in("pace_group_id", paceGroupIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    for (const [name, err] of [
      ["locations", e7], ["region_days", e8], ["training_schedules", e9],
    ] as [string, any][]) {
      if (err) throw new Error(`${name}: ${err.message}`)
    }

    const locationIds = (locations ?? []).map((l: any) => l.id)
    const regionDayIds = (regionDays ?? []).map((d: any) => d.id)
    const scheduleIds = (trainingSchedules ?? []).map((s: any) => s.id)

    // Batch 3: two levels removed from club_id
    const [
      { data: regionDayTimes, error: e10 },
      { data: locationCoaches, error: e11 },
      { data: trainingScheduleRegions, error: e12 },
      { data: scheduledWorkouts, error: e13 },
      { data: runRsvps, error: e14 },
    ] = await Promise.all([
      regionDayIds.length > 0
        ? admin.from("region_day_times").select("*").in("region_day_id", regionDayIds)
        : Promise.resolve({ data: [], error: null }),
      locationIds.length > 0
        ? admin.from("location_coaches").select("*").in("location_id", locationIds)
        : Promise.resolve({ data: [], error: null }),
      scheduleIds.length > 0
        ? admin.from("training_schedule_regions").select("*").in("training_schedule_id", scheduleIds)
        : Promise.resolve({ data: [], error: null }),
      scheduleIds.length > 0
        ? admin.from("scheduled_workouts").select("*").in("training_schedule_id", scheduleIds)
        : Promise.resolve({ data: [], error: null }),
      memberIds.length > 0
        ? admin.from("run_rsvps").select("*").in("member_id", memberIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    for (const [name, err] of [
      ["region_day_times", e10], ["location_coaches", e11],
      ["training_schedule_regions", e12], ["scheduled_workouts", e13], ["run_rsvps", e14],
    ] as [string, any][]) {
      if (err) throw new Error(`${name}: ${err.message}`)
    }

    return NextResponse.json({
      regions: regions ?? [],
      region_days: regionDays ?? [],
      region_day_times: regionDayTimes ?? [],
      locations: locations ?? [],
      coaches: coaches ?? [],
      location_coaches: locationCoaches ?? [],
      pace_groups: paceGroups ?? [],
      pace_options: paceOptions ?? [],
      training_schedules: trainingSchedules ?? [],
      training_schedule_regions: trainingScheduleRegions ?? [],
      workout_types: workoutTypes ?? [],
      scheduled_workouts: scheduledWorkouts ?? [],
      members: members ?? [],
      club_model_invites: [],
      run_rsvps: runRsvps ?? [],
    })
  } catch (err: any) {
    console.error("club-model GET error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
