import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { computeStreaks, unlockedAchievements, nextAchievement } from "@/lib/streaks"

function admin() {
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

    const db = admin()
    const { data: { user }, error: authError } = await db.auth.getUser(authHeader.replace("Bearer ", ""))
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: allCheckins } = await db
      .from("run_checkins")
      .select("checked_in_at, run_id")
      .eq("user_id", user.id)

    const timestamps = (allCheckins || []).map((c: any) => c.checked_in_at as string)
    const checkedInRunIds = (allCheckins || []).map((c: any) => c.run_id as string)

    const totalRuns = timestamps.length
    const { current: currentStreak, longest: longestStreak } = computeStreaks(timestamps)

    const stats = { totalRuns, currentStreak, longestStreak }
    const unlocked = unlockedAchievements(stats)
    const next = nextAchievement(stats)

    return NextResponse.json({ stats, unlocked, next, checkedInRunIds })
  } catch (err: any) {
    console.error("my-stats error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
