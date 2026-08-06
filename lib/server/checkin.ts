import type { SupabaseClient } from "@supabase/supabase-js"
import { computeStreaks, unlockedAchievements, ACHIEVEMENTS } from "@/lib/streaks"
import { getProgressDisplay, type ChallengeRow } from "@/lib/missionProgress"

export type PerformCheckInParams = {
  userId: string
  runId: string
  checkedInBy?: string | null
  checkinMethod?: "geolocation" | "manual"
  selectedChallengeId?: string | null
}

/** Shared by the self (geolocation) and manual (coach/director) check-in routes — same passport/streak/mission rollup either way. */
export async function performCheckIn(db: SupabaseClient, params: PerformCheckInParams) {
  const { userId, runId, checkedInBy = null, checkinMethod = "geolocation", selectedChallengeId = null } = params

  const { data: run, error: runErr } = await db.from("runs").select("id, club_id, date").eq("id", runId).single()
  if (runErr || !run) throw new Error("Run not found")

  // A run only ever gets one check-in per user (enforced by a unique index
  // on run_checkins(run_id, user_id) too, but we check first so a repeat
  // call — double-tap, retry, watcher racing the button — doesn't re-run
  // the passport/streak/badge rollup below and double-count anything.
  const { data: existing } = await db
    .from("run_checkins")
    .select("id")
    .eq("run_id", runId)
    .eq("user_id", userId)
    .maybeSingle()
  if (existing) {
    return {
      ok: true,
      alreadyCheckedIn: true,
      stats: null,
      unlocked: [],
      newAchievement: null,
      clubId: run.club_id,
      checkInId: existing.id,
      newlyCompletedChallenges: [],
      passport: null,
    }
  }

  // Snapshot which challenges were already completed before this check-in,
  // so we can diff afterward and tell the client what just unlocked.
  const { data: completedBefore } = await db
    .from("user_challenge_progress")
    .select("challenge_id")
    .eq("user_id", userId)
    .not("completed_at", "is", null)
  const completedBeforeIds = new Set((completedBefore || []).map((r: { challenge_id: string }) => r.challenge_id))

  const { data: checkinRow, error: insertErr } = await db.from("run_checkins").insert({
    run_id: runId,
    user_id: userId,
    club_id: run.club_id,
    checkin_method: checkinMethod,
    checked_in_by: checkedInBy,
    selected_challenge_id: selectedChallengeId,
  }).select("id").single()

  // Two near-simultaneous requests (e.g. the watcher and a manual tap) can
  // both pass the "existing?" check above before either inserts — the
  // run_id/user_id unique index (code 23505) is the real backstop. Treat
  // that race the same as "already checked in" rather than a hard failure.
  if (insertErr?.code === "23505") {
    const { data: raceRow } = await db.from("run_checkins").select("id").eq("run_id", runId).eq("user_id", userId).single()
    return {
      ok: true,
      alreadyCheckedIn: true,
      stats: null,
      unlocked: [],
      newAchievement: null,
      clubId: run.club_id,
      checkInId: raceRow?.id ?? null,
      newlyCompletedChallenges: [],
      passport: null,
    }
  }
  if (insertErr) throw insertErr
  const checkInId = checkinRow.id

  // Checking into a run no longer requires having joined the klub first —
  // auto-enroll in its free community membership. Only inserts if the user
  // isn't already a member (free or paid), so an existing paid membership
  // is left untouched. Best-effort, shouldn't fail the check-in if it errors.
  const { error: subErr } = await db.from("subscriptions").upsert(
    { user_id: userId, club_id: run.club_id },
    { onConflict: "user_id,club_id", ignoreDuplicates: true }
  )
  if (subErr) console.error("Auto-membership enrollment failed:", subErr)

  // Also roll this up into the Passport klub/city stamps — best-effort,
  // shouldn't fail the run check-in if it errors
  const { data: passportData, error: passportErr } = await db.rpc("checkin_to_club_admin", {
    p_user_id: userId,
    p_club_id: run.club_id,
    p_run_id: run.id,
  })
  if (passportErr) console.error("Passport rollup failed:", passportErr)

  // Compute updated stats
  const { data: allCheckins } = await db
    .from("run_checkins")
    .select("checked_in_at")
    .eq("user_id", userId)

  const timestamps = (allCheckins || []).map((c: { checked_in_at: string }) => c.checked_in_at)
  const totalRuns = timestamps.length
  const { current: currentStreak, longest: longestStreak } = computeStreaks(timestamps)

  const stats = { totalRuns, currentStreak, longestStreak }
  const unlocked = unlockedAchievements(stats).map((a) => a.id)

  // Detect newly unlocked achievement (based on count thresholds hit exactly now)
  const runThresholds: Record<number, string> = { 1: "first_step", 5: "rhythm", 10: "regular", 25: "dedicated", 50: "half_century", 100: "century_club" }
  const streakThresholds: Record<number, string> = { 2: "on_a_roll", 4: "monthly", 12: "quarter", 52: "year_rounder" }
  const newAchievementId =
    runThresholds[totalRuns] ??
    (streakThresholds[currentStreak] && currentStreak > 0 ? streakThresholds[currentStreak] : undefined)
  const newAchievement = newAchievementId
    ? ACHIEVEMENTS.find((a) => a.id === newAchievementId) ?? null
    : null

  // Diff against the pre-checkin snapshot to find challenges the
  // run_checkins trigger (see engagement_challenges_functions migration)
  // just completed, so the client can celebrate them — with the same
  // current/target/metricLabel numbers the Missions page shows.
  const { data: completedAfter } = await db
    .from("user_challenge_progress")
    .select("challenge_id, progress, challenges(slug, name, description, type, criteria_config)")
    .eq("user_id", userId)
    .not("completed_at", "is", null)
  const newlyCompletedChallenges = ((completedAfter || []) as any[])
    .filter((r) => !completedBeforeIds.has(r.challenge_id) && r.challenges)
    .map((r) => {
      const challenge = r.challenges as ChallengeRow
      const { current, target, metricLabel } = getProgressDisplay(challenge, r.progress)
      return { slug: challenge.slug, name: challenge.name, description: challenge.description, current, target, metricLabel }
    })

  return {
    ok: true,
    alreadyCheckedIn: false,
    stats,
    unlocked,
    newAchievement,
    clubId: run.club_id,
    checkInId,
    newlyCompletedChallenges,
    passport: passportErr ? null : passportData,
  }
}

export type CheckInResult = Awaited<ReturnType<typeof performCheckIn>>
