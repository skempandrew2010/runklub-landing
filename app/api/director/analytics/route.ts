import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
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

    const token = authHeader.replace("Bearer ", "")
    const admin = getAdminSupabase()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const clubId = req.nextUrl.searchParams.get("club_id")
    if (!clubId) return NextResponse.json({ error: "club_id is required" }, { status: 400 })

    const { data: club } = await admin.from("clubs").select("id, name").eq("id", clubId).eq("user_id", user.id).single()
    if (!club) return NextResponse.json({ error: "Klub not found or unauthorized" }, { status: 403 })

    const { data: subs } = await admin.from("subscriptions").select("user_id").eq("club_id", clubId)
    const memberIds = [...new Set((subs ?? []).map((s) => s.user_id))]

    if (memberIds.length === 0) {
      return NextResponse.json({
        memberCount: 0,
        recentWorkouts: [],
        crossClubCheckins: [],
        premium: { subscriberCount: 0, subscribers: [], referralSubscriberCount: 0, monthlyRevenueCents: 0, isPlaceholder: true },
      })
    }

    const [profilesRes, recentCheckinsRes, otherClubCheckinsRes, premiumRes, referralRes] = await Promise.all([
      admin.from("profiles").select("id, display_name, avatar_url").in("id", memberIds),
      admin.from("run_checkins")
        .select("id, user_id, checked_in_at, run_id, runs(title, date)")
        .eq("club_id", clubId)
        .order("checked_in_at", { ascending: false })
        .limit(30),
      admin.from("club_checkins")
        .select("user_id, club_id, checkin_count, first_checkin_at, clubs(name)")
        .in("user_id", memberIds)
        .neq("club_id", clubId)
        .order("first_checkin_at", { ascending: false })
        .limit(50),
      admin.from("passport_premium_subscriptions")
        .select("user_id, started_at")
        .in("user_id", memberIds)
        .eq("status", "active"),
      admin.from("passport_premium_subscriptions")
        .select("price_cents, referral_pct")
        .eq("referring_club_id", clubId)
        .eq("status", "active"),
    ])

    const profileById: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
    for (const p of profilesRes.data ?? []) profileById[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url }

    const recentWorkouts = ((recentCheckinsRes.data ?? []) as any[]).map((c) => ({
      checkinId: c.id,
      userId: c.user_id,
      displayName: profileById[c.user_id]?.display_name ?? "Runner",
      avatarUrl: profileById[c.user_id]?.avatar_url ?? null,
      runId: c.run_id,
      runTitle: c.runs?.title ?? "Run",
      runDate: c.runs?.date ?? null,
      checkedInAt: c.checked_in_at,
    }))

    const crossClubCheckins = ((otherClubCheckinsRes.data ?? []) as any[]).map((c) => ({
      userId: c.user_id,
      displayName: profileById[c.user_id]?.display_name ?? "Runner",
      otherClubId: c.club_id,
      otherClubName: c.clubs?.name ?? "Another klub",
      checkinCount: c.checkin_count,
      firstCheckinAt: c.first_checkin_at,
    }))

    const premiumSubscribers = ((premiumRes.data ?? []) as any[]).map((s) => ({
      userId: s.user_id,
      displayName: profileById[s.user_id]?.display_name ?? "Runner",
      startedAt: s.started_at,
    }))

    const monthlyRevenueCents = ((referralRes.data ?? []) as any[]).reduce(
      (sum, s) => sum + Math.round(s.price_cents * Number(s.referral_pct)),
      0
    )

    return NextResponse.json({
      memberCount: memberIds.length,
      recentWorkouts,
      crossClubCheckins,
      premium: {
        subscriberCount: premiumSubscribers.length,
        subscribers: premiumSubscribers,
        referralSubscriberCount: (referralRes.data ?? []).length,
        monthlyRevenueCents,
        isPlaceholder: true,
      },
    })
  } catch (err: any) {
    console.error("director analytics error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
