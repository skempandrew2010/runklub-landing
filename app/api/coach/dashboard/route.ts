import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Deliberately omits anything revenue/payment-related (membership_price_cents,
// Stripe Connect, Passport Premium referral revenue) — a coach sees
// attendance/roster/retention for their scope, never member payments.
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const admin = getAdminSupabase()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const clubId = req.nextUrl.searchParams.get("club_id")
    if (!clubId) return NextResponse.json({ error: "club_id is required" }, { status: 400 })

    const { data: coach } = await admin
      .from("coaches")
      .select("id, name, pace_group_ids, region_ids")
      .eq("club_id", clubId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle()

    if (!coach) return NextResponse.json({ error: "You're not an active coach for this klub" }, { status: 403 })

    const paceGroupIds: string[] = coach.pace_group_ids ?? []
    const regionIds: string[] = coach.region_ids ?? []

    const { data: club } = await admin.from("clubs").select("id, name, user_id").eq("id", clubId).single()
    if (!club) return NextResponse.json({ error: "Klub not found" }, { status: 404 })

    const { data: directorProfile } = await admin.from("profiles").select("display_name, avatar_url").eq("id", club.user_id).maybeSingle()

    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30)
    const sixtyDaysAgo = new Date(today); sixtyDaysAgo.setDate(today.getDate() - 60)
    // Monday of the current week, plus the next few weeks — coaches see a
    // read-only look-ahead at their athletes' upcoming training, not just today.
    const dayOfWeek = today.getDay()
    const mondayDiff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const thisMonday = new Date(today); thisMonday.setDate(today.getDate() + mondayDiff)
    const WEEKS_AHEAD = 4
    const mondays: string[] = []
    for (let i = 0; i < WEEKS_AHEAD; i++) {
      const d = new Date(thisMonday); d.setDate(thisMonday.getDate() + i * 7)
      mondays.push(d.toISOString().slice(0, 10))
    }

    const [pgRes, regionRes, allRunsRes, scheduleRes] = await Promise.all([
      admin.from("pace_groups").select("id, name").in("id", paceGroupIds.length > 0 ? paceGroupIds : ["00000000-0000-0000-0000-000000000000"]),
      regionIds.length > 0 ? admin.from("regions").select("id, name").in("id", regionIds) : Promise.resolve({ data: [] }),
      // Titles follow the "PaceGroup · Branch" convention (see WeeklyScheduleTab/
      // can_chat_on_run) — fetch every upcoming run for the klub and filter by
      // parsed pace group/branch below, same as the rest of the app does.
      admin.from("runs")
        .select("id, title, date, time, timezone, distance, meeting_point, members_only, pace_group_ids, kind")
        .eq("club_id", clubId)
        .eq("kind", "run")
        .gte("date", thirtyDaysAgo.toISOString().slice(0, 10))
        .order("date", { ascending: true })
        .order("time", { ascending: true }),
      paceGroupIds.length > 0
        ? admin.from("club_weekly_schedule")
            .select("week_of, day_of_week, pace_group_id, workout_type_id, notes")
            .eq("club_id", clubId).in("week_of", mondays)
            .in("pace_group_id", paceGroupIds)
        : Promise.resolve({ data: [] }),
    ])

    const paceGroupNameById: Record<string, string> = {}
    for (const pg of pgRes.data ?? []) paceGroupNameById[pg.id] = pg.name

    const workoutTypeIds = [...new Set(((scheduleRes.data ?? []) as any[]).map((r) => r.workout_type_id).filter(Boolean))]
    const { data: workoutRows } = workoutTypeIds.length > 0
      ? await admin.from("runs").select("id, title").in("id", workoutTypeIds)
      : { data: [] }
    const workoutTitleById: Record<string, string> = {}
    for (const w of workoutRows ?? []) workoutTitleById[w.id] = w.title

    // Monday-first display, matching day_of_week's 0=Sun..6=Sat storage.
    const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
    const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    const fmtWeekLabel = (weekOf: string) => {
      const start = new Date(weekOf + "T00:00:00")
      const end = new Date(weekOf + "T00:00:00"); end.setDate(end.getDate() + 6)
      return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${end.toLocaleDateString("en-US", { day: "numeric" })}`
    }
    const weeklySchedules = mondays.map((weekOf) => ({
      weekOf,
      weekLabel: fmtWeekLabel(weekOf),
      paceGroups: (pgRes.data ?? []).map((pg) => {
        const rowsForGroup = ((scheduleRes.data ?? []) as any[]).filter((r) => r.pace_group_id === pg.id && r.week_of === weekOf)
        const days = DAY_ORDER.map((d) => {
          const row = rowsForGroup.find((r) => r.day_of_week === d)
          return {
            dayOfWeek: d,
            dayLabel: DAY_LABELS[d],
            workoutTitle: row?.workout_type_id ? workoutTitleById[row.workout_type_id] ?? null : null,
            notes: row?.notes ?? null,
          }
        })
        return { paceGroupId: pg.id, paceGroupName: pg.name, days }
      }),
    }))

    // A run is in this coach's scope if it has no pace_group_ids (open to
    // everyone) or overlaps their assigned groups.
    const inScope = (run: { pace_group_ids: string[] | null }) =>
      !run.pace_group_ids || run.pace_group_ids.length === 0 || run.pace_group_ids.some((id) => paceGroupIds.includes(id))

    const scopedRuns = ((allRunsRes.data ?? []) as any[]).filter(inScope)
    const upcomingRuns = scopedRuns.filter((r) => r.date >= todayStr).slice(0, 15)
    const recentRuns = scopedRuns.filter((r) => r.date <= todayStr)

    // Roster: active members whose pace group (and branch, if the coach has
    // one assigned) falls within this coach's scope.
    let rosterQuery = admin
      .from("members")
      .select("id, user_id, name, email, pace_group_id, preferred_region_id, status")
      .eq("club_id", clubId)
      .eq("status", "active")
    if (paceGroupIds.length > 0) rosterQuery = rosterQuery.in("pace_group_id", paceGroupIds)
    if (regionIds.length > 0) rosterQuery = rosterQuery.in("preferred_region_id", regionIds)
    const { data: rosterRows } = await rosterQuery

    const roster = (rosterRows ?? []) as { id: string; user_id: string | null; name: string; pace_group_id: string | null }[]
    const rosterUserIds = roster.map((r) => r.user_id).filter((id): id is string => !!id)

    const [profilesRes, checkinsRes] = await Promise.all([
      rosterUserIds.length > 0
        ? admin.from("profiles").select("id, display_name, avatar_url").in("id", rosterUserIds)
        : Promise.resolve({ data: [] }),
      rosterUserIds.length > 0
        ? admin.from("run_checkins").select("user_id, checked_in_at").eq("club_id", clubId).in("user_id", rosterUserIds).order("checked_in_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ])

    const profileByUserId: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
    for (const p of profilesRes.data ?? []) profileByUserId[p.id] = { display_name: (p as any).display_name, avatar_url: (p as any).avatar_url }

    const lastCheckinByUser: Record<string, string> = {}
    for (const c of (checkinsRes.data ?? []) as { user_id: string; checked_in_at: string }[]) {
      if (!lastCheckinByUser[c.user_id]) lastCheckinByUser[c.user_id] = c.checked_in_at
    }

    let active = 0, atRisk = 0, churned = 0
    const rosterOut = roster.map((m) => {
      const last = m.user_id ? lastCheckinByUser[m.user_id] : undefined
      let bucket: "active" | "at_risk" | "churned" = "churned"
      if (last) {
        const lastDate = new Date(last)
        bucket = lastDate >= thirtyDaysAgo ? "active" : lastDate >= sixtyDaysAgo ? "at_risk" : "churned"
      }
      if (bucket === "active") active++
      else if (bucket === "at_risk") atRisk++
      else churned++
      return {
        userId: m.user_id,
        displayName: (m.user_id && profileByUserId[m.user_id]?.display_name) || m.name || "Runner",
        avatarUrl: (m.user_id && profileByUserId[m.user_id]?.avatar_url) || null,
        paceGroupName: m.pace_group_id ? paceGroupNameById[m.pace_group_id] ?? null : null,
        lastCheckinAt: last ?? null,
        attendanceBucket: bucket,
      }
    })

    // Show-up rate over the coach's scoped runs in the last 30 days.
    const recentRunIds = recentRuns.map((r) => r.id)
    const [rsvpRes, checkinCountRes] = await Promise.all([
      recentRunIds.length > 0 ? admin.from("rsvps").select("run_id, going").in("run_id", recentRunIds) : Promise.resolve({ data: [] }),
      recentRunIds.length > 0 ? admin.from("run_checkins").select("run_id").in("run_id", recentRunIds) : Promise.resolve({ data: [] }),
    ])
    const totalRsvps = ((rsvpRes.data ?? []) as { going: boolean }[]).filter((r) => r.going).length
    const totalCheckins = (checkinCountRes.data ?? []).length

    return NextResponse.json({
      clubId: club.id,
      clubName: club.name,
      coachName: coach.name,
      director: {
        userId: club.user_id,
        name: directorProfile?.display_name || "Director",
        avatarUrl: directorProfile?.avatar_url ?? null,
      },
      paceGroups: pgRes.data ?? [],
      regions: regionRes.data ?? [],
      weeklySchedules,
      upcomingRuns: upcomingRuns.map((r) => ({
        id: r.id, title: r.title, date: r.date, time: r.time, timezone: r.timezone,
        distance: r.distance, meeting_point: r.meeting_point, members_only: r.members_only,
      })),
      roster: rosterOut,
      analytics: {
        rosterSize: roster.length,
        retention: { active, atRisk, churned },
        showUp: { totalRsvps, totalCheckins, rate: totalRsvps > 0 ? totalCheckins / totalRsvps : null },
      },
    })
  } catch (err: any) {
    console.error("coach dashboard error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
