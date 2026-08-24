"use client"

import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { localDateStr } from "@/utils/dates"
import { CalendarCheck, ChevronRight, Users, Zap, Crown } from "lucide-react"
import Link from "next/link"
import ChallengeHubBanner from "@/components/ChallengeHubBanner"
import PendingCoachInviteBanner from "@/components/PendingCoachInviteBanner"
import { isVerifiedClub } from "@/utils/clubTier"
import { formatRunTime } from "@/lib/timezone"
import VerifiedBadge from "@/components/VerifiedBadge"

// ── Types ─────────────────────────────────────────────────────────────────────

type Club = { id: string; name: string; image_url: string | null; city: string | null; user_id: string; tier: string | null }

type Run = {
  id: string
  title: string
  date: string
  time: string
  timezone: string | null
  distance: string | null
  meeting_point: string | null
  description: string | null
  is_in_person: boolean
  members_only: boolean
  club_id: string
  club_name?: string
  club_image?: string | null
}

type ScheduleRun = Run & { dayLabel: string }

type Stats = { totalRuns: number; currentStreak: number; longestStreak: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function formatTime(run: { date: string; time: string; timezone?: string | null }) {
  return formatRunTime(run)
}

function currentWeekBounds(): { monday: string; sunday: string } {
  const today = new Date()
  const day = today.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(today)
  mon.setDate(today.getDate() + diff)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return { monday: fmt(mon), sunday: fmt(sun) }
}

function weekLabel(): string {
  const { monday, sunday } = currentWeekBounds()
  const start = new Date(monday + "T00:00:00")
  const end = new Date(sunday + "T00:00:00")
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${end.toLocaleDateString("en-US", { day: "numeric" })}`
}

function splitTitle(title: string) {
  const idx = title.lastIndexOf(" · ")
  return idx === -1
    ? { paceGroup: title, branch: null }
    : { paceGroup: title.slice(0, idx), branch: title.slice(idx + 3) }
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  const today = new Date()
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow"
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

const GRADIENTS = [
  "from-[#2d5a1b] to-[#111a0a]", "from-[#1b3d5a] to-[#111a0a]",
  "from-[#5a3d1b] to-[#111a0a]", "from-[#3d1b5a] to-[#111a0a]",
  "from-[#1b5a3d] to-[#111a0a]", "from-[#5a2b1b] to-[#111a0a]",
]
function getGradient(name: string) {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  return GRADIENTS[hash % GRADIENTS.length]
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

// ── Main Component ────────────────────────────────────────────────────────────

export default function HubContent() {
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [role, setRole] = useState<string>("member")
  const [myKlubs, setMyKlubs] = useState<Club[]>([])
  const [managedKlubs, setManagedKlubs] = useState<Club[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [scheduleRuns, setScheduleRuns] = useState<ScheduleRun[]>([])
  const [hasPaidMembership, setHasPaidMembership] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  const [stats, setStats] = useState<Stats | null>(null)

  const todayStr = localDateStr()

  const loadStats = useCallback(async (token: string) => {
    try {
      const res = await fetch("/api/my-stats", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setStats(data.stats)
    } catch {
      // non-blocking
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const user = session?.user
      if (!user || !session) {
        setLoading(false)
        return
      }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, role")
        .eq("id", user.id)
        .single()
      setDisplayName(profile?.display_name || user.email?.split("@")[0] || null)
      const userRole = profile?.role || "member"
      setRole(userRole)

      const todayDate = localDateStr()

      const [coachRes, subsRes, coachingRes] = await Promise.all([
        supabase.from("clubs").select("id, name, image_url, city, user_id, tier").eq("user_id", user.id),
        supabase
          .from("subscriptions")
          .select("member_type, clubs(id, name, image_url, city, user_id, tier)")
          .eq("user_id", user.id),
        supabase
          .from("coaches")
          .select("club_id, clubs(id, name, image_url, city, user_id, tier)")
          .eq("user_id", user.id)
          .eq("status", "active"),
      ])

      const coachClubs: Club[] = coachRes.data || []
      const subRows = (subsRes.data || []) as any[]
      const subClubs: Club[] = subRows.map((s) => s.clubs).filter(Boolean)
      const coachingClubs: Club[] = ((coachingRes.data || []) as any[]).map((r) => r.clubs).filter(Boolean)
      setHasPaidMembership(subRows.some((s) => s.member_type === "paid"))
      const clubMap = new Map<string, Club>()
      ;[...coachClubs, ...coachingClubs, ...subClubs].forEach((c) => {
        if (!clubMap.has(c.id)) clubMap.set(c.id, c)
      })
      const allClubs = Array.from(clubMap.values())
      setMyKlubs(allClubs)
      if (userRole === "manager") setManagedKlubs(coachClubs)

      const clubIds = allClubs.map((c) => c.id)
      const { monday, sunday } = currentWeekBounds()

      const [communityRunsRes, membershipsRes] = await Promise.all([
        clubIds.length > 0
          ? supabase
              .from("runs")
              .select(
                "id, title, date, time, timezone, distance, meeting_point, description, is_in_person, members_only, club_id"
              )
              .in("club_id", clubIds)
              .eq("members_only", false)
              .gte("date", todayDate)
              .order("date")
              .order("time")
              .limit(10)
          : Promise.resolve({ data: [] }),
        supabase
          .from("members")
          .select("club_id, pace_group_id, preferred_region_id, status")
          .eq("user_id", user.id)
          .eq("status", "active"),
      ])

      setRuns(
        ((communityRunsRes.data || []) as Run[]).map((r) => ({
          ...r,
          club_name: clubMap.get(r.club_id)?.name,
          club_image: clubMap.get(r.club_id)?.image_url,
        }))
      )

      const memberships: {
        club_id: string
        pace_group_id: string | null
        preferred_region_id: string | null
      }[] = (membershipsRes.data || []).filter((m: any) => m.pace_group_id)

      if (memberships.length > 0 && clubIds.length > 0) {
        const pgIds = memberships.map((m) => m.pace_group_id!).filter(Boolean)
        const regionIds = memberships.map((m) => m.preferred_region_id!).filter(Boolean)

        const [pgRes, regionRes, weekRunsRes] = await Promise.all([
          supabase.from("pace_groups").select("id, name").in("id", pgIds),
          regionIds.length > 0
            ? supabase.from("regions").select("id, name").in("id", regionIds)
            : Promise.resolve({ data: [] }),
          supabase
            .from("runs")
            .select(
              "id, title, date, time, timezone, distance, meeting_point, description, is_in_person, members_only, club_id"
            )
            .in("club_id", memberships.map((m) => m.club_id))
            .eq("members_only", true)
            .gte("date", monday)
            .lte("date", sunday)
            .order("date")
            .order("time"),
        ])

        const pgMap: Record<string, string> = {}
        for (const pg of pgRes.data || []) pgMap[pg.id] = pg.name
        const regionMap: Record<string, string> = {}
        for (const r of regionRes.data || []) regionMap[r.id] = r.name

        const weekRuns: Run[] = weekRunsRes.data || []
        const myRuns: ScheduleRun[] = []

        for (const membership of memberships) {
          const pgName = pgMap[membership.pace_group_id!]
          if (!pgName) continue
          const regionName = membership.preferred_region_id
            ? regionMap[membership.preferred_region_id]
            : null
          const matched = weekRuns.filter((run) => {
            if (run.club_id !== membership.club_id) return false
            const { paceGroup, branch } = splitTitle(run.title)
            if (paceGroup !== pgName) return false
            return branch === null || (regionName !== null && branch === regionName)
          })
          for (const run of matched) {
            if (!myRuns.find((r) => r.id === run.id)) {
              myRuns.push({
                ...run,
                club_name: clubMap.get(run.club_id)?.name,
                club_image: clubMap.get(run.club_id)?.image_url,
                dayLabel: formatDay(run.date),
              })
            }
          }
        }
        myRuns.sort(
          (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
        )
        setScheduleRuns(myRuns)
      }

      setLoading(false)

      // Non-blocking stats fetch
      loadStats(session.access_token)
    }
    load()
  }, [loadStats])

  const isManager = role === "manager"
  const firstName = displayName?.split(" ")[0] ?? null

  return (
    <div className="min-h-screen bg-[#1a2110]">
      {/* ── GREETING BANNER ── */}
      <div className="bg-[#1e2d12] border-b border-[#2e3d1a]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <p
              suppressHydrationWarning
              className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1"
            >
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h1
              suppressHydrationWarning
              className="text-3xl font-black text-white leading-tight"
            >
              {greeting()}
              {firstName ? `, ${firstName}` : ""}.
            </h1>
            {!loading && userId && (
              <p className="text-sm text-white/40 mt-1.5">
                {runs.length === 0 ? (
                  "No upcoming community runs from your klubs."
                ) : (
                  <>
                    {"You have "}
                    <span className="text-white font-semibold">{runs.length}</span>
                    {` upcoming run${runs.length !== 1 ? "s" : ""}.`}
                  </>
                )}
              </p>
            )}
          </div>
          {!loading && userId && (
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href={myKlubs.length > 0 ? `/clubs/${myKlubs[0].id}` : "/explore"}
                className="text-center px-5 py-3.5 rounded-2xl bg-[#2e3d1a] border border-[#3d5220] min-w-[80px] hover:border-[#c5f135]/40 transition"
              >
                <p className="text-2xl font-black text-white leading-none">{myKlubs.length}</p>
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mt-1">
                  Klubs
                </p>
              </Link>
              <div className="text-center px-5 py-3.5 rounded-2xl bg-[#2e3d1a] border border-[#3d5220] min-w-[80px]">
                <p className="text-2xl font-black text-[#c5f135] leading-none">
                  {stats?.totalRuns ?? "—"}
                </p>
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mt-1">
                  Runs
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {loading && (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
          </div>
        )}

        {!loading && !userId && (
          <div className="max-w-md mx-auto bg-[#1e2d12] rounded-2xl p-12 text-center border border-[#2e3d1a]">
            <Users className="w-12 h-12 text-white/15 mx-auto mb-4" />
            <p className="text-white font-bold text-lg">Sign in to see your klubs and runs</p>
            <p className="text-white/40 text-sm mt-1">
              Your klubs and upcoming runs will appear here.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-block px-6 py-3 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition"
            >
              Sign In
            </Link>
          </div>
        )}

        {!loading && userId && (
          <div className="space-y-10">
            <PendingCoachInviteBanner />
            <ChallengeHubBanner userId={userId} />

            {/* ── PASSPORT (front and center) ── */}
            <Link
              href="/passport/credits"
              className="block rounded-2xl overflow-hidden border border-[#c5f135]/30 bg-gradient-to-br from-[#c5f135]/15 to-[#1e2d12] hover:border-[#c5f135]/60 transition px-5 py-5 sm:px-6 sm:py-6"
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-[#c5f135]/15 border border-[#c5f135]/30 flex items-center justify-center shrink-0">
                  <Crown className="w-5 h-5 text-[#c5f135]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-black text-white">RunKlub Passport</p>
                  <p className="text-xs text-white/50 mt-0.5">Buy credits, check into any klub's runs beyond your own.</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
              </div>
            </Link>

            {/* ── MY KLUBS (first) ── */}
            <section>
              <SectionHeader title="My Klubs" />
              {myKlubs.length === 0 ? (
                <div className="bg-[#1e2d12] rounded-2xl p-6 text-center border border-[#2e3d1a]">
                  <p className="text-white/50 text-sm font-medium">No klubs yet.</p>
                  <Link
                    href="/explore"
                    className="mt-4 inline-block px-4 py-2 bg-[#c5f135] text-[#1a2110] text-xs font-black rounded-full hover:bg-[#d4ff45] transition"
                  >
                    Discover Klubs
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl overflow-hidden border border-[#2e3d1a] bg-[#1e2d12] divide-y divide-[#2e3d1a]">
                  {myKlubs.map((club) => {
                    const nextRun = runs.find((r) => r.club_id === club.id)
                    return (
                      <Link
                        key={club.id}
                        href={`/clubs/${club.id}`}
                        className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#243018] transition group"
                      >
                        <div
                          className={`w-11 h-11 rounded-xl shrink-0 overflow-hidden flex items-center justify-center border border-[#3d5220] group-hover:border-[#c5f135]/60 bg-gradient-to-br ${getGradient(club.name)}`}
                        >
                          {club.image_url ? (
                            <img
                              src={club.image_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xs font-black text-white/30">
                              {club.name
                                .split(" ")
                                .map((w) => w[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                            <span className="truncate">{club.name}</span>
                            {isVerifiedClub(club.tier) && <VerifiedBadge compact />}
                          </p>
                          <p className="text-xs text-white/40 mt-0.5 truncate">
                            {club.city}
                            {club.city && nextRun && " · "}
                            {nextRun && `Next: ${formatDay(nextRun.date)} ${formatTime(nextRun)}`}
                            {!club.city && !nextRun && "No upcoming runs"}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>

            {/* ── MY TRAINING SCHEDULE (paid members only) ── */}
            <section>
              <SectionHeader
                title="My Training Schedule"
                sub={`Week of ${weekLabel()}`}
              />
              {scheduleRuns.length > 0 ? (
                <div className="space-y-3">
                  {scheduleRuns.map((run) => {
                    const isToday = run.date === todayStr
                    return (
                      <Link
                        key={run.id}
                        href={`/runs/${run.id}`}
                        className={`block bg-[#1e2d12] border rounded-2xl overflow-hidden hover:border-[#c5f135]/40 transition ${
                          isToday ? "border-[#c5f135]/30" : "border-[#2e3d1a]"
                        }`}
                      >
                        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                          <p
                            className={`text-[10px] font-black uppercase tracking-widest ${
                              isToday ? "text-[#c5f135]" : "text-white/35"
                            }`}
                          >
                            {run.dayLabel}
                          </p>
                          <span className="text-[9px] font-black text-white/30 uppercase tracking-wide">
                            {run.is_in_person ? "Group · In Person" : "On Your Own"}
                          </span>
                        </div>
                        <div className="px-4 pb-3">
                          <div className="flex items-end justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xl font-black text-white leading-tight">
                                {formatTime(run)}
                              </p>
                              <div className="flex items-center gap-2 flex-wrap mt-1">
                                {run.distance && (
                                  <span className="text-xs text-white/50">{run.distance}</span>
                                )}
                                {run.meeting_point && (
                                  <span className="text-xs text-white/50">{run.meeting_point}</span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
                          </div>
                          {run.description && (
                            <p className="text-xs text-white/50 mt-2 leading-relaxed">
                              {run.description}
                            </p>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : hasPaidMembership ? (
                <div className="bg-[#1e2d12] rounded-2xl p-8 text-center border border-[#2e3d1a]">
                  <p className="text-white/40 text-sm">Nothing scheduled this week.</p>
                </div>
              ) : (
                <div className="bg-[#1e2d12] rounded-2xl p-6 text-center border border-[#c5f135]/20">
                  <p className="text-white font-bold text-sm mb-1">Unlock a personalized training schedule</p>
                  <p className="text-white/40 text-xs mb-4">
                    Paid members get a custom weekly plan matched to their pace group.
                  </p>
                  <Link
                    href="/explore"
                    className="inline-block px-5 py-2.5 bg-[#c5f135] text-[#1a2110] text-xs font-black rounded-full hover:bg-[#d4ff45] transition"
                  >
                    Find a Paid Klub
                  </Link>
                </div>
              )}
            </section>

            {/* ── UPCOMING COMMUNITY RUNS ── */}
            <section>
              <SectionHeader title="Upcoming Runs" />
              {runs.length === 0 ? (
                <div className="bg-[#1e2d12] rounded-2xl p-10 text-center border border-[#2e3d1a]">
                  <CalendarCheck className="w-10 h-10 text-white/15 mx-auto mb-3" />
                  <p className="text-white/50 text-sm font-medium">No upcoming runs.</p>
                  <p className="text-white/25 text-xs mt-1">
                    {myKlubs.length === 0
                      ? "Join a klub to see their upcoming runs."
                      : "Check back when your klubs post their next run."}
                  </p>
                </div>
              ) : (
                <div className="bg-[#1e2d12] rounded-2xl overflow-hidden border border-[#2e3d1a] divide-y divide-[#2e3d1a]">
                  {runs.map((run) => {
                    const isToday = run.date === todayStr
                    const dayLabel = formatDay(run.date)
                    const meta = [run.club_name, formatTime(run), run.distance]
                      .filter(Boolean)
                      .join(" · ")
                    return (
                      <Link
                        key={run.id}
                        href={`/runs/${run.id}`}
                        className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#243018] transition"
                      >
                        <div className="w-9 h-9 rounded-xl bg-[#2e3d1a] shrink-0 overflow-hidden flex items-center justify-center">
                          {run.club_image ? (
                            <img
                              src={run.club_image}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-[10px] font-black text-white/40">
                              {run.club_name
                                ?.split(" ")
                                .map((w: string) => w[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{run.title}</p>
                          <p className="text-xs text-white/40 truncate mt-0.5">{meta}</p>
                        </div>
                        <span
                          className={`shrink-0 text-[10px] font-bold ${
                            isToday ? "text-[#c5f135]" : "text-white/30"
                          }`}
                        >
                          {dayLabel}
                        </span>
                        <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>

            {/* ── DIRECTOR ── */}
            {isManager && managedKlubs.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-5 rounded-full bg-[#c5f135] shrink-0" />
                  <h2 className="text-sm font-black text-white tracking-tight">Director</h2>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#c5f135]/10 border border-[#c5f135]/20">
                    <Zap className="w-2.5 h-2.5 text-[#c5f135]" />
                    <span className="text-[10px] font-black text-[#c5f135]">
                      {managedKlubs.length}
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-[#2e3d1a]" />
                </div>
                <div className="rounded-2xl overflow-hidden border border-[#c5f135]/15 bg-[#c5f135]/[0.03] divide-y divide-[#2e3d1a]">
                  {managedKlubs.map((club) => (
                    <div key={club.id} className="px-4 py-4 flex items-center gap-3">
                      <div
                        className={`w-11 h-11 rounded-xl shrink-0 overflow-hidden flex items-center justify-center border border-[#3d5220] bg-gradient-to-br ${getGradient(club.name)}`}
                      >
                        {club.image_url ? (
                          <img
                            src={club.image_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs font-black text-white/30">
                            {club.name
                              .split(" ")
                              .map((w) => w[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                          <span className="truncate">{club.name}</span>
                          {isVerifiedClub(club.tier) && <VerifiedBadge compact />}
                        </p>
                        {club.city && (
                          <p className="text-xs text-white/40 mt-0.5">{club.city}</p>
                        )}
                      </div>
                      <Link
                        href="/director"
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-[#c5f135] text-[#1a2110] text-xs font-black rounded-full shrink-0 hover:bg-[#d4ff45] transition"
                      >
                        Manage <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
