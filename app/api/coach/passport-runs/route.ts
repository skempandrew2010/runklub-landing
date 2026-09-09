import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Which of this coach's upcoming runs are Passport-designated (see
// passport_designated_runs), and who's redeemed a check-in against each -
// so a coach can actually recognize Passport runners showing up and greet
// them, instead of the run just looking like any other public run.
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
      .select("id, pace_group_ids")
      .eq("club_id", clubId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle()

    if (!coach) return NextResponse.json({ error: "You're not an active coach for this klub" }, { status: 403 })

    const paceGroupIds: string[] = coach.pace_group_ids ?? []

    const { data: club } = await admin.from("clubs").select("id, name").eq("id", clubId).single()
    if (!club) return NextResponse.json({ error: "Klub not found" }, { status: 404 })

    const todayStr = new Date().toISOString().slice(0, 10)

    const [runsRes, designatedRes] = await Promise.all([
      admin.from("runs")
        .select("id, title, date, time, timezone, distance, meeting_point, members_only, pace_group_ids")
        .eq("club_id", clubId)
        .eq("kind", "run")
        .gte("date", todayStr)
        .order("date", { ascending: true })
        .order("time", { ascending: true }),
      admin.from("passport_designated_runs").select("run_id").eq("club_id", clubId),
    ])

    const designatedRunIds = new Set((designatedRes.data ?? []).map((r: any) => r.run_id as string))

    // Same in-scope rule as the rest of the coach dashboard - a run with no
    // pace_group_ids is open to everyone, otherwise it must overlap the
    // coach's assigned groups.
    const inScope = (run: { pace_group_ids: string[] | null }) =>
      !run.pace_group_ids || run.pace_group_ids.length === 0 || run.pace_group_ids.some((id) => paceGroupIds.includes(id))

    const passportRuns = ((runsRes.data ?? []) as any[]).filter((r) => designatedRunIds.has(r.id) && inScope(r))
    const runIds = passportRuns.map((r) => r.id)

    const { data: redemptions } = runIds.length > 0
      ? await admin.from("passport_redemptions")
          .select("user_id, run_id, redeemed_at")
          .in("run_id", runIds)
          .eq("status", "confirmed")
          .order("redeemed_at", { ascending: true })
      : { data: [] }

    const attendeeUserIds = [...new Set((redemptions ?? []).map((r: any) => r.user_id as string))]
    const { data: profiles } = attendeeUserIds.length > 0
      ? await admin.from("profiles").select("id, display_name, avatar_url").in("id", attendeeUserIds)
      : { data: [] }

    const profileById: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
    for (const p of profiles ?? []) profileById[(p as any).id] = { display_name: (p as any).display_name, avatar_url: (p as any).avatar_url }

    const attendeesByRun: Record<string, { userId: string; displayName: string; avatarUrl: string | null; redeemedAt: string }[]> = {}
    for (const r of (redemptions ?? []) as { user_id: string; run_id: string; redeemed_at: string }[]) {
      const list = attendeesByRun[r.run_id] ?? (attendeesByRun[r.run_id] = [])
      list.push({
        userId: r.user_id,
        displayName: profileById[r.user_id]?.display_name || "Runner",
        avatarUrl: profileById[r.user_id]?.avatar_url ?? null,
        redeemedAt: r.redeemed_at,
      })
    }

    return NextResponse.json({
      clubName: club.name,
      runs: passportRuns.map((r) => ({
        id: r.id, title: r.title, date: r.date, time: r.time, timezone: r.timezone,
        distance: r.distance, meeting_point: r.meeting_point, members_only: r.members_only,
        attendees: attendeesByRun[r.id] ?? [],
      })),
    })
  } catch (err: any) {
    console.error("coach passport-runs error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
