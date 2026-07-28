import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { computeStreaks, unlockedAchievements, ACHIEVEMENTS } from "@/lib/streaks"

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const db = admin()
    const { data: { user }, error: authError } = await db.auth.getUser(authHeader.replace("Bearer ", ""))
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { run_id } = await req.json()
    if (!run_id) return NextResponse.json({ error: "run_id required" }, { status: 400 })

    // Fetch run to get club_id
    const { data: run } = await db.from("runs").select("id, club_id, date").eq("id", run_id).single()
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 })

    // Snapshot which challenges were already completed before this check-in,
    // so we can diff afterward and tell the client what just unlocked.
    const { data: completedBefore } = await db
      .from("user_challenge_progress")
      .select("challenge_id")
      .eq("user_id", user.id)
      .not("completed_at", "is", null)
    const completedBeforeIds = new Set((completedBefore || []).map((r: any) => r.challenge_id))

    // Record check-in (ignore if already exists)
    const { error: insertErr } = await db.from("run_checkins").upsert(
      { run_id, user_id: user.id, club_id: run.club_id },
      { onConflict: "run_id,user_id", ignoreDuplicates: true }
    )
    if (insertErr) throw insertErr

    // Upsert with ignoreDuplicates doesn't return ignored (already-existing) rows,
    // so re-select to reliably get the check-in's id either way.
    const { data: checkinRow } = await db
      .from("run_checkins")
      .select("id")
      .eq("run_id", run_id)
      .eq("user_id", user.id)
      .single()
    const checkInId = checkinRow?.id ?? null

    // Checking into a run no longer requires having joined the klub first —
    // auto-enroll in its free community membership. Only inserts if the user
    // isn't already a member (free or paid), so an existing paid membership
    // is left untouched. Best-effort, shouldn't fail the check-in if it errors.
    const { error: subErr } = await db.from("subscriptions").upsert(
      { user_id: user.id, club_id: run.club_id },
      { onConflict: "user_id,club_id", ignoreDuplicates: true }
    )
    if (subErr) console.error("Auto-membership enrollment failed:", subErr)

    // Also roll this up into the Passport klub/city stamps — best-effort,
    // shouldn't fail the run check-in if it errors
    const { data: passportData, error: passportErr } = await db.rpc("checkin_to_club_admin", {
      p_user_id: user.id,
      p_club_id: run.club_id,
      p_run_id: run.id,
    })
    if (passportErr) console.error("Passport rollup failed:", passportErr)

    // Compute updated stats
    const { data: allCheckins } = await db
      .from("run_checkins")
      .select("checked_in_at")
      .eq("user_id", user.id)

    const timestamps = (allCheckins || []).map((c: any) => c.checked_in_at as string)
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
    // just completed, so the client can celebrate them.
    const { data: completedAfter } = await db
      .from("user_challenge_progress")
      .select("challenge_id, challenges(slug, name, description)")
      .eq("user_id", user.id)
      .not("completed_at", "is", null)
    const newlyCompletedChallenges = ((completedAfter || []) as any[])
      .filter((r) => !completedBeforeIds.has(r.challenge_id) && r.challenges)
      .map((r) => ({ slug: r.challenges.slug, name: r.challenges.name, description: r.challenges.description }))

    return NextResponse.json({
      ok: true,
      stats,
      unlocked,
      newAchievement,
      clubId: run.club_id,
      checkInId,
      newlyCompletedChallenges,
      passport: passportErr ? null : passportData,
    })
  } catch (err: any) {
    console.error("checkin error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
