"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { mondayOf, localDateStr } from "@/utils/dates"
import { formatRunTime } from "@/lib/timezone"
import { CalendarPlus, ChevronRight, ListChecks, BarChart3, MessageSquare, Pencil } from "lucide-react"

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

function TileLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5 hover:border-[#c5f135]/40 transition"
    >
      {children}
    </Link>
  )
}

export default function CoachHomeContent({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true)
  const [clubId, setClubId] = useState<string | null>(null)
  const [clubName, setClubName] = useState("")
  const [paceGroups, setPaceGroups] = useState<PaceGroup[]>([])
  const [scheduleByPg, setScheduleByPg] = useState<Record<string, Set<number>>>({})
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [upcomingRun, setUpcomingRun] = useState<UpcomingRun | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const load = async () => {
      const { data: clubs } = await supabase
        .from("clubs").select("id, name").eq("user_id", userId).order("created_at").limit(1)
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
      // clears on any Home visit) so this tile stays accurate until they
      // actually open Messages — see the matching write in director/page.tsx.
      const lastSeen = localStorage.getItem("coach_messages_last_seen") ?? "1970-01-01T00:00:00.000Z"
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
      <div className="min-h-screen bg-[#1a2110] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-white/50 text-sm">You don&apos;t manage a klub yet.</p>
        <Link href="/submit-club" className="px-5 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition">
          Create a Klub
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-6 space-y-4">
        <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest px-1">{clubName}</p>

        {/* ── TRAINING SCHEDULE ── */}
        <TileLink href="/director?tab=runs">
          <div className="flex items-center gap-2 mb-4">
            <ListChecks className="w-3.5 h-3.5 text-[#c5f135]" />
            <h2 className="text-xs font-bold text-white uppercase tracking-widest">Training Schedule</h2>
            <span className="text-[10px] text-white/35 ml-auto">Week of {weekLabel()}</span>
          </div>
          {paceGroups.length === 0 ? (
            <p className="text-sm text-white/40">No pace groups set up yet.</p>
          ) : (
            <div className="space-y-2.5">
              {paceGroups.map((pg) => {
                const days = scheduleByPg[pg.id] ?? new Set<number>()
                return (
                  <div key={pg.id} className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white/80 truncate">{pg.name}</span>
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
        </TileLink>

        {/* ── MONTHLY ANALYTICS ── */}
        <TileLink href="/director/analytics">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-3.5 h-3.5 text-[#c5f135]" />
            <h2 className="text-xs font-bold text-white uppercase tracking-widest">Analytics</h2>
            <ChevronRight className="w-3.5 h-3.5 text-white/20 ml-auto" />
          </div>
          {!analytics ? (
            <p className="text-sm text-white/40">Loading…</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
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
        </TileLink>

        {/* ── UPCOMING RUN (edit) ── */}
        <Link
          href={upcomingRun ? `/dashboard/${clubId}/edit-run/${upcomingRun.id}` : `/dashboard/${clubId}/create-run`}
          className="block bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5 hover:border-[#c5f135]/40 transition"
        >
          <div className="flex items-center gap-2 mb-4">
            <CalendarPlus className="w-3.5 h-3.5 text-[#c5f135]" />
            <h2 className="text-xs font-bold text-white uppercase tracking-widest">Upcoming Run</h2>
            {upcomingRun && <Pencil className="w-3 h-3 text-white/20 ml-auto" />}
          </div>
          {upcomingRun ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{upcomingRun.title}</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {formatDay(upcomingRun.date)} · {formatRunTime(upcomingRun)}
                  {upcomingRun.distance && ` · ${upcomingRun.distance}`}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
            </div>
          ) : (
            <p className="text-sm text-white/40">No upcoming runs — tap to schedule one.</p>
          )}
        </Link>

        {/* ── MESSAGES ── */}
        <TileLink href="/director?tab=communicate">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0 relative">
                <MessageSquare className="w-4 h-4 text-[#c5f135]" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#c5f135] ring-2 ring-[#1e2d12]" />
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-white">Messages</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {unreadCount > 0 ? `${unreadCount} new message${unreadCount === 1 ? "" : "s"}` : "All caught up"}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
          </div>
        </TileLink>
      </div>
    </div>
  )
}
