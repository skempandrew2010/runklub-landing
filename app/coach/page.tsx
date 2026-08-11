"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { formatRunTime } from "@/lib/timezone"
import { ChevronDown, ChevronRight, MessageSquare, Users, CalendarCheck } from "lucide-react"
import RunChatPanel, { type ChatTarget } from "@/components/RunChatPanel"
import CoachCheckInRoster from "@/components/CoachCheckInRoster"

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

type DashboardData = {
  clubId: string
  clubName: string
  coachName: string
  paceGroups: { id: string; name: string }[]
  regions: { id: string; name: string }[]
  upcomingRuns: DashboardRun[]
  roster: RosterEntry[]
  analytics: {
    rosterSize: number
    retention: { active: number; atRisk: number; churned: number }
    showUp: { totalRsvps: number; totalCheckins: number; rate: number | null }
  }
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

export default function CoachDashboardPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [data, setData] = useState<DashboardData | null>(null)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }
      setUserId(user.id)

      const { data: coachRows } = await supabase.from("coaches").select("club_id").eq("user_id", user.id).eq("status", "active").order("accepted_at").limit(1)
      const clubId = coachRows?.[0]?.club_id
      if (!clubId) { setLoading(false); return }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }

      const res = await fetch(`/api/coach/dashboard?club_id=${clubId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Something went wrong."); setLoading(false); return }
      setData(json)
      setLoading(false)
    }
    load()
  }, [router])

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

  const { retention, showUp } = data.analytics

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-6 space-y-10">

        <div>
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">{data.clubName}</p>
          <h1 className="text-2xl font-black text-white leading-tight">Coach Dashboard</h1>
          <p className="text-sm text-white/40 mt-1">
            {data.paceGroups.length > 0 ? data.paceGroups.map((pg) => pg.name).join(", ") : "No pace group assigned yet"}
            {data.regions.length > 0 && ` · ${data.regions.map((r) => r.name).join(", ")}`}
          </p>
        </div>

        {/* ── ANALYTICS (no revenue) ── */}
        <section>
          <SectionHeader title="Attendance" sub="Last 30 days · your scope only" />
          <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4 grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-lg font-black text-white">{data.analytics.rosterSize}</p>
              <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">Roster</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-[#c5f135]">{retention.active}</p>
              <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">Active</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-white">{showUp.rate !== null ? `${Math.round(showUp.rate * 100)}%` : "—"}</p>
              <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">Show-up Rate</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-2 px-1 text-[11px] text-white/35">
            <span><span className="text-yellow-400 font-bold">{retention.atRisk}</span> at risk (31–60d)</span>
            <span><span className="text-red-400 font-bold">{retention.churned}</span> churned (&gt;60d)</span>
          </div>
        </section>

        {/* ── UPCOMING RUNS + CHECK-IN ── */}
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
                        onClick={(e) => {
                          e.stopPropagation()
                          setChatTarget({ type: "run", id: run.id, title: run.title, date: run.date, time: run.time, timezone: run.timezone, distance: run.distance, meeting_point: run.meeting_point, clubName: data.clubName })
                        }}
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

        {/* ── ROSTER ── */}
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
                  <span className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                    m.attendanceBucket === "active" ? "bg-[#c5f135]/10 text-[#c5f135]" :
                    m.attendanceBucket === "at_risk" ? "bg-yellow-400/10 text-yellow-400" :
                    "bg-red-400/10 text-red-400"
                  }`}>
                    {m.attendanceBucket === "at_risk" ? "at risk" : m.attendanceBucket}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── COMMUNICATE ── */}
        <section>
          <SectionHeader title="Messages" />
          <button
            onClick={() => setChatTarget({ type: "club", id: data.clubId, clubName: data.clubName })}
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
        </section>

      </div>

      {chatTarget && userId && (
        <RunChatPanel target={chatTarget} userId={userId} onClose={() => setChatTarget(null)} />
      )}
    </div>
  )
}
