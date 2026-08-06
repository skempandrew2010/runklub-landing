import { supabase } from "@/lib/supabase"
import { getProgressDisplay, type ChallengeRow, type ChallengeType } from "@/lib/missionProgress"

export type { ChallengeType, ChallengeRow }

export type UserChallengeProgressRow = {
  challenge_id: string
  progress: Record<string, any>
  completed_at: string | null
  updated_at: string
}

export type ChallengeWithProgress = ChallengeRow & {
  current: number
  target: number
  metricLabel: string
  completed: boolean
  completedAt: string | null
}

/** Every active, per-user challenge (excludes club_vs_club — that's Klub Showdown, shown separately). */
export async function getChallengesWithProgress(): Promise<ChallengeWithProgress[]> {
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: challenges }, progressRes] = await Promise.all([
    supabase
      .from("challenges")
      .select("id, slug, name, description, type, criteria_config")
      .eq("is_active", true)
      .neq("type", "club_vs_club"),
    user
      ? supabase.from("user_challenge_progress").select("challenge_id, progress, completed_at, updated_at").eq("user_id", user.id)
      : Promise.resolve({ data: [] as UserChallengeProgressRow[] }),
  ])

  const progressMap = new Map(((progressRes.data as UserChallengeProgressRow[]) || []).map((p) => [p.challenge_id, p]))

  return ((challenges as ChallengeRow[]) || [])
    .filter((c) => c.type !== "club_vs_club")
    .map((c) => {
      const row = progressMap.get(c.id)
      const { current, target, metricLabel } = getProgressDisplay(c, row?.progress)
      return {
        ...c,
        current,
        target,
        metricLabel,
        completed: !!row?.completed_at,
        completedAt: row?.completed_at ?? null,
      }
    })
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      const aPct = a.target > 0 ? a.current / a.target : 0
      const bPct = b.target > 0 ? b.current / b.target : 0
      return bPct - aPct
    })
}

export type KlubShowdownRow = {
  club_id: string
  club_name: string
  club_image_url: string | null
  club_tier: string | null
  score: number
  rank: number
}

function currentPeriodStartUTC(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`
}

/** Current calendar-month Klub Showdown standings, ranked by check-in count. */
export async function getKlubShowdownLeaderboard(): Promise<KlubShowdownRow[]> {
  const { data: challenge } = await supabase.from("challenges").select("id").eq("slug", "klub-showdown").maybeSingle()
  if (!challenge) return []

  const { data } = await supabase
    .from("club_challenge_scores")
    .select("club_id, score, clubs(name, image_url, tier)")
    .eq("challenge_id", challenge.id)
    .eq("period_start", currentPeriodStartUTC())
    .order("score", { ascending: false })

  return ((data as any[]) || []).map((row, i) => ({
    club_id: row.club_id,
    club_name: row.clubs?.name ?? "Klub",
    club_image_url: row.clubs?.image_url ?? null,
    club_tier: row.clubs?.tier ?? null,
    score: row.score,
    rank: i + 1,
  }))
}

export type RunAttendee = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
}

/** Who else has already checked into this run — the pool of people you can tag as a run buddy. */
export async function getRunAttendees(runId: string, excludeUserId: string): Promise<RunAttendee[]> {
  const { data } = await supabase
    .from("run_checkins")
    .select("user_id, profiles(display_name, avatar_url)")
    .eq("run_id", runId)
    .neq("user_id", excludeUserId)

  return ((data as any[]) || [])
    .filter((r) => r.profiles)
    .map((r) => ({ user_id: r.user_id, display_name: r.profiles.display_name, avatar_url: r.profiles.avatar_url }))
}

/** Tags one or more friends on a check-in (Bring a Friend / Klub Crew). RLS enforces they checked into the same run. */
export async function tagRunBuddies(checkInId: string, friendUserIds: string[]) {
  if (friendUserIds.length === 0) return { error: null }
  const rows = friendUserIds.map((id) => ({ check_in_id: checkInId, referred_user_id: id }))
  const { error } = await supabase.from("checkin_referrals").insert(rows)
  return { error }
}

export type HubNotification = { id: string; kind: "streak_risk" | "comeback" | "completed"; message: string }

/** Nudges for the Hub tab notification spot: a lapsing streak, a comeback welcome-back, recent completions. */
export async function getHubChallengeNotifications(): Promise<HubNotification[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from("user_challenge_progress")
    .select("challenge_id, progress, completed_at, challenges(slug, name)")
    .eq("user_id", user.id)

  const rows = (data as any[]) || []
  const notifications: HubNotification[] = []
  const dayMs = 24 * 60 * 60 * 1000

  const comeback = rows.find((r) => r.challenges?.slug === "comeback")
  if (comeback?.completed_at && Date.now() - new Date(comeback.completed_at).getTime() < dayMs) {
    notifications.push({ id: "comeback", kind: "comeback", message: "Welcome back! Glad to see you again 👋" })
  }

  for (const r of rows) {
    if (r.challenges?.slug === "comeback" || !r.completed_at) continue
    if (Date.now() - new Date(r.completed_at).getTime() < dayMs) {
      notifications.push({ id: `completed-${r.challenge_id}`, kind: "completed", message: `Mission complete: ${r.challenges?.name}! 🎉` })
    }
  }

  const streak = rows.find((r) => r.challenges?.slug === "never-miss-4")
  const currentStreak = streak?.progress?.current_streak ?? 0
  if (currentStreak > 0) {
    const now = new Date()
    const day = now.getUTCDay() // 0 Sun .. 6 Sat
    const isLateInWeek = day === 5 || day === 6 || day === 0
    const weekStart = new Date(now)
    weekStart.setUTCDate(now.getUTCDate() + (day === 0 ? -6 : 1 - day))
    weekStart.setUTCHours(0, 0, 0, 0)

    const { count } = await supabase
      .from("run_checkins")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("checked_in_at", weekStart.toISOString())

    if (isLateInWeek && (count ?? 0) === 0) {
      notifications.push({
        id: "streak_risk",
        kind: "streak_risk",
        message: `Your ${currentStreak}-week streak resets soon — get a run in before Sunday!`,
      })
    }
  }

  return notifications
}
