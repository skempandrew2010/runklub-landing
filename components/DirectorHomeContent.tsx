"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { mondayOf, localDateStr } from "@/utils/dates"
import { formatRunTime } from "@/lib/timezone"
import { CalendarCheck, ChevronRight, MessageSquare } from "lucide-react"
import PendingCoachInviteBanner from "@/components/PendingCoachInviteBanner"
import YourKlubsSection from "@/components/YourKlubsSection"

type PaceGroup = { id: string; name: string }
type ScheduleRow = { day_of_week: number; pace_group_id: string; workout_type_id: string | null }
type UpcomingRun = {
  id: string
  title: string
  date: string
  time: string
  timezone: string | null
  distance: string | null
  meeting_point: string | null
}
type AnalyticsSummary = {
  audience: { followerCount: number; paidMemberCount: number }
  rsvpVsCheckin: { rate: number | null }
  retention: { active: number; atRisk: number; churned: number }
}

const DAY_ABBR = ["S", "M", "T", "W", "T", "F", "S"]
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Monday-first, matches day_of_week's 0=Sun..6=Sat storage

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function weekLabel() {
  const monday = mondayOf()
  const start = new Date(monday + "T00:00:00")
  const end = new Date(monday + "T00:00:00")
  end.setDate(end.getDate() + 6)
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${end.toLocaleDateString("en-US", { day: "numeric" })}`
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  const today = new Date()
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow"
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-5 rounded-full bg-[#c5f135] shrink-0" />
      <div>
        <h2 className="text-sm font-black text-white tracking-tight leading-none">{title}</h2>
        {sub && <p className="text-[10px] text-white/35 mt-0.5">{sub}</p>}
      </div>
      <div className="flex-1 h-px bg-[#2e3d1a]" />
    </div>
  )
}

export default function DirectorHomeContent({ userId }: { userId: string }) {
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [clubId, setClubId] = useState<string | null>(null)
  const [clubName, setClubName] = useState("")
  const [paceGroups, setPaceGroups] = useState<PaceGroup[]>([])
  const [scheduleByPg, setScheduleByPg] = useState<Record<string, Set<number>>>({})
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [upcomingRun, setUpcomingRun] = useState<UpcomingRun | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  const firstName = displayName?.split(" ")[0] ?? null

  useEffect(() => {
    const load = async () => {
      const [{ data: profile }, { data: clubs }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", userId).single(),
        supabase.from("clubs").select("id, name").eq("user_id", userId).order("created_at").limit(1),
      ])
      setDisplayName(profile?.display_name ?? null)

      const club = clubs?.[0]
      if (!club) { setLoading(false); return }
      setClubId(club.id)
      setClubName(club.name)

      const monday = mondayOf()
      const today = localDateStr()

      const [pgRes, scheduleRes, runRes, sessionRes, clubRunsRes] = await Promise.all([
        supabase.from("pace_groups").select("id, name").eq("club_id", club.id).order("pace_min"),
        supabase.from("club_weekly_schedule")
          .select("day_of_week, pace_group_id, workout_type_id")
          .eq("club_id", club.id).eq("week_of", monday),
        supabase.from("runs")
          .select("id, title, date, time, timezone, distance, meeting_point")
          .eq("club_id", club.id).eq("kind", "run")
          .gte("date", today)
          .order("date").order("time")
          .limit(1),
        supabase.auth.getSession(),
        supabase.from("runs").select("id").eq("club_id", club.id),
      ])

      setPaceGroups(pgRes.data ?? [])

      const byPg: Record<string, Set<number>> = {}
      for (const row of (scheduleRes.data ?? []) as ScheduleRow[]) {
        if (!row.workout_type_id) continue
        if (!byPg[row.pace_group_id]) byPg[row.pace_group_id] = new Set()
        byPg[row.pace_group_id].add(row.day_of_week)
      }
      setScheduleByPg(byPg)
      setUpcomingRun((runRes.data?.[0] as UpcomingRun) ?? null)

      const session = sessionRes.data.session
      if (session) {
        fetch(`/api/director/analytics?club_id=${club.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => json && setAnalytics(json))
          .catch(() => {})
      }

      // Unread messages, tracked separately from the general nav badge (which
      // clears on any Home visit) so this section stays accurate until they
      // actually open Messages — see the matching write in director/page.tsx.
      const lastSeen = localStorage.getItem("director_messages_last_seen") ?? "1970-01-01T00:00:00.000Z"
      const runIds = (clubRunsRes.data ?? []).map((r) => r.id)
      if (runIds.length > 0) {
        const { count } = await supabase
          .from("run_chats")
          .select("id", { count: "exact", head: true })
          .in("run_id", runIds)
          .gt("created_at", lastSeen)
          .neq("user_id", userId)
        setUnreadCount(count ?? 0)
      }

      setLoading(false)
    }
    load()
  }, [userId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  if (!clubId) {
    return (
      <div className="min-h-screen bg-[#1a2110]">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="max-w-md mx-auto bg-[#1e2d12] rounded-2xl p-12 text-center border border-[#2e3d1a]">
            <p className="text-white font-bold text-lg">You don&apos;t manage a klub yet.</p>
            <Link href="/submit-club" className="mt-5 inline-block px-6 py-3 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition">
              Create a Klub
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110]">
      {/* ── GREETING BANNER ── */}
      <div className="bg-[#1e2d12] border-b border-[#2e3d1a]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <p suppressHydrationWarning className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <h1 suppressHydrationWarning className="text-3xl font-black text-white leading-tight">
              {greeting()}{firstName ? `, ${firstName}` : ""}.
            </h1>
            <p className="text-sm text-white/40 mt-1.5">{clubName}</p>
          </div>
          {analytics && (
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-center px-5 py-3.5 rounded-2xl bg-[#2e3d1a] border border-[#3d5220] min-w-[80px]">
                <p className="text-2xl font-black text-white leading-none">{analytics.audience.followerCount}</p>
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mt-1">Followers</p>
              </div>
              <div className="text-center px-5 py-3.5 rounded-2xl bg-[#2e3d1a] border border-[#3d5220] min-w-[80px]">
                <p className="text-2xl font-black text-[#c5f135] leading-none">{analytics.audience.paidMemberCount}</p>
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mt-1">Members</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="space-y-10">

          <PendingCoachInviteBanner />

          <YourKlubsSection userId={userId} />

          {/* ── TRAINING SCHEDULE ── */}
          <section>
            <SectionHeader title="Training Schedule" sub={`Week of ${weekLabel()}`} />
            <Link
              href="/director?tab=runs"
              className="block rounded-2xl overflow-hidden border border-[#2e3d1a] bg-[#1e2d12] hover:border-[#c5f135]/30 transition"
            >
              {paceGroups.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-white/50 text-sm font-medium">No pace groups set up yet.</p>
                  <p className="text-white/25 text-xs mt-1">Tap to set up pace groups and a weekly schedule.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#2e3d1a]">
                  {paceGroups.map((pg) => {
                    const days = scheduleByPg[pg.id] ?? new Set<number>()
                    return (
                      <div key={pg.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                        <span className="text-sm font-bold text-white truncate">{pg.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {DAY_ORDER.map((day) => (
                            <span
                              key={day}
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${
                                days.has(day) ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1a2110] text-white/25"
                              }`}
                            >
                              {DAY_ABBR[day]}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Link>
          </section>

          {/* ── ANALYTICS ── */}
          <section>
            <SectionHeader title="Analytics" sub="This month" />
            <Link
              href="/director/analytics"
              className="flex items-center gap-3 rounded-2xl overflow-hidden border border-[#2e3d1a] bg-[#1e2d12] hover:border-[#c5f135]/30 transition px-4 py-4"
            >
              {!analytics ? (
                <p className="text-sm text-white/40">Loading…</p>
              ) : (
                <div className="grid grid-cols-3 gap-3 flex-1">
                  <div className="text-center">
                    <p className="text-lg font-black text-white">{analytics.audience.followerCount}</p>
                    <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">Followers</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-black text-[#c5f135]">{analytics.audience.paidMemberCount}</p>
                    <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">Members</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-black text-white">
                      {analytics.rsvpVsCheckin.rate !== null ? `${Math.round(analytics.rsvpVsCheckin.rate * 100)}%` : "—"}
                    </p>
                    <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">Show-up Rate</p>
                  </div>
                </div>
              )}
              <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
            </Link>
          </section>

          {/* ── UPCOMING RUN (edit) ── */}
          <section>
            <SectionHeader title="Upcoming Run" />
            {upcomingRun ? (
              <Link
                href={`/dashboard/${clubId}/edit-run/${upcomingRun.id}`}
                className="flex items-center gap-3 px-4 py-3.5 rounded-2xl overflow-hidden border border-[#2e3d1a] bg-[#1e2d12] hover:border-[#c5f135]/30 transition"
              >
                <div className="w-9 h-9 rounded-xl bg-[#2e3d1a] shrink-0 flex items-center justify-center">
                  <CalendarCheck className="w-4 h-4 text-[#c5f135]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{upcomingRun.title}</p>
                  <p className="text-xs text-white/40 truncate mt-0.5">
                    {formatDay(upcomingRun.date)} · {formatRunTime(upcomingRun)}
                    {upcomingRun.distance && ` · ${upcomingRun.distance}`}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-bold text-white/30">Edit</span>
                <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
              </Link>
            ) : (
              <Link
                href={`/dashboard/${clubId}/create-run`}
                className="block bg-[#1e2d12] rounded-2xl p-10 text-center border border-[#2e3d1a] hover:border-[#c5f135]/30 transition"
              >
                <CalendarCheck className="w-10 h-10 text-white/15 mx-auto mb-3" />
                <p className="text-white/50 text-sm font-medium">No upcoming runs.</p>
                <p className="text-white/25 text-xs mt-1">Tap to schedule one.</p>
              </Link>
            )}
          </section>

          {/* ── MESSAGES ── */}
          <section>
            <SectionHeader title="Messages" />
            <Link
              href="/director?tab=communicate"
              className="flex items-center gap-3 px-4 py-3.5 rounded-2xl overflow-hidden border border-[#2e3d1a] bg-[#1e2d12] hover:border-[#c5f135]/30 transition"
            >
              <div className="w-9 h-9 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0 relative">
                <MessageSquare className="w-4 h-4 text-[#c5f135]" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#c5f135] ring-2 ring-[#1e2d12]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">Messages</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {unreadCount > 0 ? `${unreadCount} new message${unreadCount === 1 ? "" : "s"}` : "All caught up"}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
            </Link>
          </section>

        </div>
        <div className="h-8" />
      </div>
    </div>
  )
}
