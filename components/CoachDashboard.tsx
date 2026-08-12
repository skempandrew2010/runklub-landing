"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { formatRunTime } from "@/lib/timezone"
import { ChevronDown, ChevronRight, MessageSquare, Users, CalendarCheck } from "lucide-react"
import RunChatPanel, { type ChatTarget, type DmTarget } from "@/components/RunChatPanel"
import CoachCheckInRoster from "@/components/CoachCheckInRoster"
import PendingCoachInviteBanner from "@/components/PendingCoachInviteBanner"
import WeeklyScheduleTab from "@/app/director/WeeklyScheduleTab"

type DashboardRun = {
  id: string
  title: string
  date: string
  time: string
  timezone: string | null
  distance: string | null
  meeting_point: string | null
  members_only: boolean
}

type RosterEntry = {
  userId: string | null
  displayName: string
  avatarUrl: string | null
  paceGroupName: string | null
  lastCheckinAt: string | null
  attendanceBucket: "active" | "at_risk" | "churned"
}

type ScheduleDay = { dayOfWeek: number; dayLabel: string; workoutTitle: string | null; notes: string | null }
type WeekSchedule = { weekOf: string; weekLabel: string; paceGroups: { paceGroupId: string; paceGroupName: string; days: ScheduleDay[] }[] }

type DashboardData = {
  clubId: string
  clubName: string
  coachName: string
  director: { userId: string; name: string; avatarUrl: string | null }
  paceGroups: { id: string; name: string }[]
  regions: { id: string; name: string }[]
  weeklySchedules: WeekSchedule[]
  upcomingRuns: DashboardRun[]
  roster: RosterEntry[]
  analytics: {
    rosterSize: number
    retention: { active: number; atRisk: number; churned: number }
    showUp: { totalRsvps: number; totalCheckins: number; rate: number | null }
  }
}

export type CoachTabKey = "members" | "communicate" | "schedule"
type TabKey = CoachTabKey
const TABS: { key: TabKey; label: string }[] = [
  { key: "members", label: "Members" },
  { key: "communicate", label: "Communicate" },
  { key: "schedule", label: "Schedule" },
]

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

function formatDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  const today = new Date()
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow"
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

/**
 * The limited "Coach" view of /director — rendered instead of the full
 * ManagerView when the signed-in user doesn't own the klub but is an active
 * coach for one. Deliberately narrower than the director's tab set: just
 * Members (roster + check-in, scoped to their pace group/branch),
 * Communicate (klub chat + DM the director), and a read-only multi-week
 * Schedule. No analytics here — that's its own Analytics tab — and no
 * editing the training plan.
 */
export default function CoachDashboard({ userId, clubId, initialTab }: { userId: string; clubId?: string; initialTab?: TabKey }) {
  const [tab, setTab] = useState<TabKey>(initialTab ?? "members")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [data, setData] = useState<DashboardData | null>(null)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null)
  const [chatInitialDm, setChatInitialDm] = useState<DmTarget | undefined>(undefined)

  useEffect(() => {
    const load = async () => {
      // A specific clubId (e.g. just accepted that klub's coach invite) skips
      // the auto-pick entirely, so accepting an invite always scopes you to
      // that klub instead of whichever one you coached first.
      let targetClubId = clubId
      if (!targetClubId) {
        const { data: coachRows } = await supabase.from("coaches").select("club_id").eq("user_id", userId).eq("status", "active").order("accepted_at", { ascending: false }).limit(1)
        targetClubId = coachRows?.[0]?.club_id
      }
      if (!targetClubId) { setLoading(false); return }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }

      const res = await fetch(`/api/coach/dashboard?club_id=${targetClubId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Something went wrong."); setLoading(false); return }
      setData(json)
      setLoading(false)
    }
    load()
  }, [userId, clubId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <p className="text-white font-bold text-lg mb-1">Not coaching anywhere yet</p>
          <p className="text-white/40 text-sm mb-5">{error || "You'll see this dashboard once a director invites you to coach their klub."}</p>
          <Link href="/explore" className="px-6 py-3 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full inline-block hover:bg-[#d4ff45] transition">
            Explore Klubs
          </Link>
        </div>
      </div>
    )
  }

  const openDirectorDm = () => {
    setChatInitialDm({ userId: data.director.userId, name: data.director.name, avatarUrl: data.director.avatarUrl })
    setChatTarget({ type: "club", id: data.clubId, clubName: data.clubName })
  }
  const openKlubChat = () => {
    setChatInitialDm(undefined)
    setChatTarget({ type: "club", id: data.clubId, clubName: data.clubName })
  }
  const openRunChat = (run: DashboardRun) => {
    setChatInitialDm(undefined)
    setChatTarget({ type: "run", id: run.id, title: run.title, date: run.date, time: run.time, timezone: run.timezone, distance: run.distance, meeting_point: run.meeting_point, clubName: data.clubName })
  }

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">

        <PendingCoachInviteBanner />

        <div>
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">{data.clubName}</p>
          <h1 className="text-2xl font-black text-white leading-tight">Coach Dashboard</h1>
          <p className="text-sm text-white/40 mt-1">
            {data.paceGroups.length > 0 ? data.paceGroups.map((pg) => pg.name).join(", ") : "No pace group assigned yet"}
            {data.regions.length > 0 && ` · ${data.regions.map((r) => r.name).join(", ")}`}
          </p>
        </div>

        {/* ── TAB STRIP ── */}
        <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-1">
          <div className="relative flex">
            <div
              className="absolute top-0 bottom-0 rounded-xl bg-[#c5f135] transition-transform duration-300 ease-out"
              style={{
                width: `${100 / TABS.length}%`,
                transform: `translateX(${TABS.findIndex((t) => t.key === tab) * 100}%)`,
              }}
            />
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative z-10 flex-1 py-2 rounded-xl text-xs font-black transition-colors duration-300 ${
                  tab === t.key ? "text-[#1a2110]" : "text-white/50 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── MEMBERS ── */}
        {tab === "members" && (
          <div key="members" className="space-y-6 animate-[fadeUp_0.2s_ease-out_forwards]">
            <section>
              <SectionHeader title="Upcoming Runs" sub="Tap a run to check people in" />
              {data.upcomingRuns.length === 0 ? (
                <div className="bg-[#1e2d12] rounded-2xl p-8 text-center border border-[#2e3d1a]">
                  <CalendarCheck className="w-8 h-8 text-white/15 mx-auto mb-2" />
                  <p className="text-white/40 text-sm">No upcoming runs in your scope.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.upcomingRuns.map((run) => {
                    const expanded = expandedRunId === run.id
                    return (
                      <div key={run.id} className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl overflow-hidden">
                        <button
                          onClick={() => setExpandedRunId(expanded ? null : run.id)}
                          className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-white truncate">{run.title}</p>
                              {run.members_only && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 border border-white/10">MEMBERS</span>
                              )}
                            </div>
                            <p className="text-xs text-white/40 mt-0.5">
                              {formatDay(run.date)} · {formatRunTime(run)}
                              {run.distance && ` · ${run.distance}`}
                            </p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); openRunChat(run) }}
                            className="shrink-0 w-8 h-8 rounded-full bg-[#2e3d1a] flex items-center justify-center hover:bg-[#3d5220] transition"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-[#c5f135]" />
                          </button>
                          <ChevronDown className={`w-4 h-4 text-white/25 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </button>
                        {expanded && (
                          <div className="px-4 pb-4 border-t border-[#2e3d1a] pt-3">
                            <CoachCheckInRoster runId={run.id} roster={data.roster.map((r) => ({ userId: r.userId, displayName: r.displayName, avatarUrl: r.avatarUrl }))} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section>
              <SectionHeader title="Your Roster" sub="Who belongs to your pace group" />
              {data.roster.length === 0 ? (
                <div className="bg-[#1e2d12] rounded-2xl p-8 text-center border border-[#2e3d1a]">
                  <Users className="w-8 h-8 text-white/15 mx-auto mb-2" />
                  <p className="text-white/40 text-sm">No one&apos;s in your pace group yet.</p>
                </div>
              ) : (
                <div className="bg-[#1e2d12] rounded-2xl overflow-hidden border border-[#2e3d1a] divide-y divide-[#2e3d1a]">
                  {data.roster.map((m, i) => (
                    <div key={m.userId ?? i} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-full shrink-0 bg-[#2e3d1a] overflow-hidden flex items-center justify-center">
                        {m.avatarUrl
                          ? <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                          : <span className="text-[10px] font-black text-[#c5f135]">{initialsOf(m.displayName)}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{m.displayName}</p>
                        <p className="text-xs text-white/40 truncate">
                          {m.paceGroupName ?? "—"}
                          {m.lastCheckinAt && ` · last run ${formatDay(m.lastCheckinAt.slice(0, 10))}`}
                        </p>
                      </div>
                      {m.attendanceBucket === "active" && (
                        <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full uppercase bg-[#c5f135]/10 text-[#c5f135]">
                          active
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── COMMUNICATE ── */}
        {tab === "communicate" && (
          <section key="communicate" className="animate-[fadeUp_0.2s_ease-out_forwards]">
            <SectionHeader title="Messages" />
            <div className="space-y-2">
              <button
                onClick={openDirectorDm}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#1e2d12] border border-[#2e3d1a] hover:border-[#c5f135]/30 transition text-left"
              >
                <div className="w-9 h-9 rounded-full bg-[#2e3d1a] overflow-hidden flex items-center justify-center shrink-0">
                  {data.director.avatarUrl
                    ? <img src={data.director.avatarUrl} alt="" className="w-full h-full object-cover" />
                    : <span className="text-xs font-black text-[#c5f135]">{initialsOf(data.director.name)}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">Message {data.director.name}</p>
                  <p className="text-xs text-white/40 mt-0.5">Your klub&apos;s director</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
              </button>
              <button
                onClick={openKlubChat}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#1e2d12] border border-[#2e3d1a] hover:border-[#c5f135]/30 transition text-left"
              >
                <div className="w-9 h-9 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4 text-[#c5f135]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">Klub Chat</p>
                  <p className="text-xs text-white/40 mt-0.5">Message the whole klub, or tap the bubble on a run to message just that run</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
              </button>
            </div>
          </section>
        )}

        {/* ── SCHEDULE (read-only) ── */}
        {tab === "schedule" && (
          <section key="schedule" className="animate-[fadeUp_0.2s_ease-out_forwards]">
            <SectionHeader title="Training Schedule" sub="Same view as your director — you just can't edit it" />
            <WeeklyScheduleTab clubId={data.clubId} paceGroupIds={data.paceGroups.map((pg) => pg.id)} readOnly />
          </section>
        )}

      </div>

      {chatTarget && userId && (
        <RunChatPanel target={chatTarget} userId={userId} onClose={() => { setChatTarget(null); setChatInitialDm(undefined) }} initialDm={chatInitialDm} />
      )}
    </div>
  )
}
