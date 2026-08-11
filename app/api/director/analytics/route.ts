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
        rsvpVsCheckin: { totalRsvps: 0, totalCheckins: 0, rate: null, recentRuns: [] },
        retention: { active: 0, atRisk: 0, churned: 0 },
        emailEngagement: { totalSent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, openRate: null, clickRate: null },
      })
    }

    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30)
    const sixtyDaysAgo = new Date(today); sixtyDaysAgo.setDate(today.getDate() - 60)

    const [profilesRes, recentCheckinsRes, otherClubCheckinsRes, premiumRes, referralRes, recentRunsRes, lastCheckinRes, emailSendsRes] = await Promise.all([
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
      // RSVP vs check-in: runs at this club in the last 30 days (including today).
      admin.from("runs")
        .select("id, title, date, rsvps(going), run_checkins(id)")
        .eq("club_id", clubId).eq("kind", "run")
        .gte("date", thirtyDaysAgo.toISOString().slice(0, 10))
        .lte("date", todayStr)
        .order("date", { ascending: false }),
      // Retention: each member's most recent check-in at this club, if any.
      admin.from("run_checkins")
        .select("user_id, checked_in_at")
        .eq("club_id", clubId)
        .in("user_id", memberIds)
        .order("checked_in_at", { ascending: false }),
      // Email engagement: recent sends to this club's members and their events.
      admin.from("email_sends")
        .select("id, sent_at, email_events(event_type)")
        .eq("club_id", clubId)
        .order("sent_at", { ascending: false })
        .limit(500),
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

    const recentRuns = ((recentRunsRes.data ?? []) as any[]).map((r) => {
      const rsvpCount = ((r.rsvps ?? []) as { going: boolean }[]).filter((x) => x.going).length
      const checkinCount = ((r.run_checkins ?? []) as any[]).length
      return { runId: r.id, title: r.title, date: r.date, rsvpCount, checkinCount }
    })
    const totalRsvps = recentRuns.reduce((sum, r) => sum + r.rsvpCount, 0)
    const totalCheckins = recentRuns.reduce((sum, r) => sum + r.checkinCount, 0)

    const lastCheckinByUser: Record<string, string> = {}
    for (const c of (lastCheckinRes.data ?? []) as { user_id: string; checked_in_at: string }[]) {
      if (!lastCheckinByUser[c.user_id]) lastCheckinByUser[c.user_id] = c.checked_in_at
    }
    let active = 0, atRisk = 0, churned = 0
    for (const id of memberIds) {
      const last = lastCheckinByUser[id]
      if (!last) { churned++; continue }
      const lastDate = new Date(last)
      if (lastDate >= thirtyDaysAgo) active++
      else if (lastDate >= sixtyDaysAgo) atRisk++
      else churned++
    }

    let emailDelivered = 0, emailOpened = 0, emailClicked = 0, emailBounced = 0, emailComplained = 0
    const emailSends = (emailSendsRes.data ?? []) as { id: string; email_events: { event_type: string }[] }[]
    for (const s of emailSends) {
      const types = new Set((s.email_events ?? []).map((e) => e.event_type))
      if (types.has("delivered")) emailDelivered++
      if (types.has("opened")) emailOpened++
      if (types.has("clicked")) emailClicked++
      if (types.has("bounced")) emailBounced++
      if (types.has("complained")) emailComplained++
    }
    const totalSent = emailSends.length

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
      rsvpVsCheckin: {
        totalRsvps,
        totalCheckins,
        rate: totalRsvps > 0 ? totalCheckins / totalRsvps : null,
        recentRuns: recentRuns.slice(0, 10),
      },
      retention: { active, atRisk, churned },
      emailEngagement: {
        totalSent,
        delivered: emailDelivered,
        opened: emailOpened,
        clicked: emailClicked,
        bounced: emailBounced,
        complained: emailComplained,
        openRate: totalSent > 0 ? emailOpened / totalSent : null,
        clickRate: totalSent > 0 ? emailClicked / totalSent : null,
      },
    })
  } catch (err: any) {
    console.error("director analytics error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
