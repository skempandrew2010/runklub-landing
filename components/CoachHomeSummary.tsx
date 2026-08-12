"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { formatRunTime } from "@/lib/timezone"
import { CalendarCheck, ChevronRight, MessageSquare } from "lucide-react"
import PendingCoachInviteBanner from "@/components/PendingCoachInviteBanner"

type DashboardRun = {
  id: string
  title: string
  date: string
  time: string
  timezone: string | null
  distance: string | null
  meeting_point: string | null
}
type WeekSchedule = { weekOf: string; weekLabel: string; paceGroups: { paceGroupId: string; paceGroupName: string; days: { dayOfWeek: number; dayLabel: string; workoutTitle: string | null }[] }[] }
type DashboardData = {
  clubName: string
  paceGroups: { id: string; name: string }[]
  weeklySchedules: WeekSchedule[]
  upcomingRuns: DashboardRun[]
  analytics: {
    rosterSize: number
    retention: { active: number; atRisk: number; churned: number }
    showUp: { totalRsvps: number; totalCheckins: number; rate: number | null }
  }
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
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

/**
 * Home summary for a Coach (not also a Director) — a condensed version of
 * both the Coaches tab and the Coach Analytics tab, same idea as
 * DirectorHomeContent. Every card deep-links into the matching tab on
 * /director for the full view.
 */
export default function CoachHomeSummary({ userId }: { userId: string }) {
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [clubId, setClubId] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)

  const firstName = displayName?.split(" ")[0] ?? null

  useEffect(() => {
    const load = async () => {
      const [{ data: profile }, { data: coachRows }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", userId).single(),
        supabase.from("coaches").select("club_id").eq("user_id", userId).eq("status", "active").order("accepted_at", { ascending: false }).limit(1),
      ])
      setDisplayName(profile?.display_name ?? null)

      const club_id = coachRows?.[0]?.club_id
      if (!club_id) { setLoading(false); return }
      setClubId(club_id)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }

      const res = await fetch(`/api/coach/dashboard?club_id=${club_id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) setData(await res.json())
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

  if (!clubId || !data) {
    return (
      <div className="min-h-screen bg-[#1a2110]">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="max-w-md mx-auto bg-[#1e2d12] rounded-2xl p-12 text-center border border-[#2e3d1a]">
            <p className="text-white font-bold text-lg">Not coaching anywhere yet.</p>
            <p className="text-white/40 text-sm mt-1">You&apos;ll see this once a director invites you to coach their klub.</p>
          </div>
        </div>
      </div>
    )
  }

  const thisWeek = data.weeklySchedules[0]
  const upcomingRun = data.upcomingRuns[0] ?? null
  const { retention, showUp } = data.analytics

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
            <p className="text-sm text-white/40 mt-1.5">{data.clubName} · Coach</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-center px-5 py-3.5 rounded-2xl bg-[#2e3d1a] border border-[#3d5220] min-w-[80px]">
              <p className="text-2xl font-black text-white leading-none">{data.analytics.rosterSize}</p>
              <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mt-1">Roster</p>
            </div>
            <div className="text-center px-5 py-3.5 rounded-2xl bg-[#2e3d1a] border border-[#3d5220] min-w-[80px]">
              <p className="text-2xl font-black text-[#c5f135] leading-none">{retention.active}</p>
              <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mt-1">Active</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="space-y-10">

          <PendingCoachInviteBanner />

          {/* ── MEMBERS (roster + next run to check in) ── */}
          <section>
            <SectionHeader title="Members" sub={`${data.analytics.rosterSize} in your pace group(s)`} />
            <Link
              href={`/director?as=coach&club_id=${clubId}&tab=members`}
              className="block rounded-2xl overflow-hidden border border-[#2e3d1a] bg-[#1e2d12] hover:border-[#c5f135]/30 transition"
            >
              {upcomingRun ? (
                <div className="flex items-center gap-3 px-4 py-3.5">
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
                  <span className="shrink-0 text-[10px] font-bold text-white/30">Check In</span>
                  <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-6">
                  <p className="flex-1 text-sm text-white/40">No upcoming runs in your scope — tap to see your roster.</p>
                  <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
                </div>
              )}
            </Link>
          </section>

          {/* ── COMMUNICATE ── */}
          <section>
            <SectionHeader title="Communicate" />
            <Link
              href={`/director?as=coach&club_id=${clubId}&tab=communicate`}
              className="flex items-center gap-3 px-4 py-3.5 rounded-2xl overflow-hidden border border-[#2e3d1a] bg-[#1e2d12] hover:border-[#c5f135]/30 transition"
            >
              <div className="w-9 h-9 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4 text-[#c5f135]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">Messages</p>
                <p className="text-xs text-white/40 mt-0.5">Message your athletes or the klub director</p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
            </Link>
          </section>

          {/* ── TRAINING SCHEDULE ── */}
          <section>
            <SectionHeader title="Training Schedule" sub={thisWeek ? `Week of ${thisWeek.weekLabel} · read-only` : undefined} />
            <Link
              href={`/director?as=coach&club_id=${clubId}&tab=schedule`}
              className="block rounded-2xl overflow-hidden border border-[#2e3d1a] bg-[#1e2d12] hover:border-[#c5f135]/30 transition"
            >
              {!thisWeek || thisWeek.paceGroups.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-white/50 text-sm font-medium">No pace group assigned yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#2e3d1a]">
                  {thisWeek.paceGroups.map((pg) => (
                    <div key={pg.paceGroupId} className="flex items-center justify-between gap-3 px-4 py-3.5">
                      <span className="text-sm font-bold text-white truncate">{pg.paceGroupName}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {DAY_ORDER.map((day) => {
                          const d = pg.days.find((x) => x.dayOfWeek === day)
                          return (
                            <span
                              key={day}
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${
                                d?.workoutTitle ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1a2110] text-white/25"
                              }`}
                            >
                              {d?.dayLabel[0]}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Link>
          </section>

          {/* ── ANALYTICS ── */}
          <section>
            <SectionHeader title="Analytics" sub="Last 30 days" />
            <Link
              href="/director/analytics"
              className="flex items-center gap-3 rounded-2xl overflow-hidden border border-[#2e3d1a] bg-[#1e2d12] hover:border-[#c5f135]/30 transition px-4 py-4"
            >
              <div className="grid grid-cols-3 gap-3 flex-1">
                <div className="text-center">
                  <p className="text-lg font-black text-white">{data.analytics.rosterSize}</p>
                  <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">Roster</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-black text-[#c5f135]">{retention.active}</p>
                  <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">Active</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-black text-white">
                    {showUp.rate !== null ? `${Math.round(showUp.rate * 100)}%` : "—"}
                  </p>
                  <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">Show-up Rate</p>
                </div>
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
