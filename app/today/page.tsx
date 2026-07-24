"use client"

import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { localDateStr } from "@/utils/dates"
import { CalendarCheck, ChevronRight, Users, Zap, CheckCircle2, Flame } from "lucide-react"
import Link from "next/link"
import type { Achievement } from "@/lib/streaks"
import { nextAchievement as computeNext } from "@/lib/streaks"
import MemberChatInbox from "@/components/MemberChatInbox"

// ── Types ─────────────────────────────────────────────────────────────────────

type Club = { id: string; name: string; image_url: string | null; city: string | null; user_id: string }

type Run = {
  id: string
  title: string
  date: string
  time: string
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

type NextAch = { achievement: Achievement; progress: number; target: number } | null

// ── Helpers ───────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`
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

function StatsStrip({
  stats,
  nextAch,
  unlocked,
}: {
  stats: Stats
  nextAch: NextAch
  unlocked: Achievement[]
}) {
  const latestUnlock = unlocked.length > 0 ? unlocked[unlocked.length - 1] : null
  const pct = nextAch ? Math.round((nextAch.progress / nextAch.target) * 100) : 100

  return (
    <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4 mb-6">
      <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3">Your Stats</p>
      <div className="flex gap-3">
        <div className="flex-1 bg-[#0e150a] rounded-xl px-3 py-3 text-center border border-[#2e3d1a]">
          <p className="text-2xl font-black leading-none">
            {stats.currentStreak > 0
              ? <span className="text-[#c5f135]">{stats.currentStreak}</span>
              : <span className="text-white/20">—</span>
            }
          </p>
          <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1">
            {stats.currentStreak > 0 ? "Wk Streak" : "No Streak"}
          </p>
          {stats.currentStreak > 0 && (
            <div className="flex justify-center mt-1">
              <Flame className="w-3 h-3 text-orange-400" />
            </div>
          )}
        </div>
        <div className="flex-1 bg-[#0e150a] rounded-xl px-3 py-3 text-center border border-[#2e3d1a]">
          <p className="text-2xl font-black text-[#c5f135] leading-none">{stats.totalRuns}</p>
          <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1">Runs</p>
        </div>
        <div className="flex-1 bg-[#0e150a] rounded-xl px-3 py-3 text-center border border-[#2e3d1a]">
          <p className="text-2xl leading-none">{latestUnlock ? latestUnlock.emoji : "🎯"}</p>
          <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1 truncate">
            {latestUnlock ? latestUnlock.name : "First Run"}
          </p>
        </div>
      </div>
      {nextAch && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-white/40">
              {nextAch.achievement.emoji} Next:{" "}
              <span className="text-white/60 font-bold">{nextAch.achievement.name}</span>
            </span>
            <span className="text-[10px] text-white/30">
              {nextAch.progress}/{nextAch.target}
            </span>
          </div>
          <div className="h-1 bg-[#2e3d1a] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#c5f135] rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function AchievementToast({
  achievement,
  onDismiss,
}: {
  achievement: Achievement
  onDismiss: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-3 bg-[#c5f135] text-[#1a2110] px-5 py-3.5 rounded-2xl shadow-xl">
        <span className="text-2xl">{achievement.emoji}</span>
        <div>
          <p className="text-xs font-black uppercase tracking-wide">Achievement Unlocked!</p>
          <p className="text-sm font-bold">{achievement.name}</p>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HubPage() {
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [role, setRole] = useState<string>("member")
  const [myKlubs, setMyKlubs] = useState<Club[]>([])
  const [managedKlubs, setManagedKlubs] = useState<Club[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [scheduleRuns, setScheduleRuns] = useState<ScheduleRun[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  // Gamification state
  const [stats, setStats] = useState<Stats | null>(null)
  const [unlocked, setUnlocked] = useState<Achievement[]>([])
  const [nextAch, setNextAch] = useState<NextAch>(null)
  const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set())
  const [checkingInId, setCheckingInId] = useState<string | null>(null)
  const [newAchievement, setNewAchievement] = useState<Achievement | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  const todayStr = localDateStr()

  const loadStats = useCallback(async (token: string) => {
    try {
      const res = await fetch("/api/my-stats", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setStats(data.stats)
      setUnlocked(data.unlocked ?? [])
      setNextAch(data.next)
      setCheckedInIds(new Set(data.checkedInRunIds ?? []))
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
      setSessionToken(session.access_token)

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, role")
        .eq("id", user.id)
        .single()
      setDisplayName(profile?.display_name || user.email?.split("@")[0] || null)
      const userRole = profile?.role || "member"
      setRole(userRole)

      const todayDate = localDateStr()

      const [coachRes, subsRes] = await Promise.all([
        supabase.from("clubs").select("id, name, image_url, city, user_id").eq("user_id", user.id),
        supabase
          .from("subscriptions")
          .select("clubs(id, name, image_url, city, user_id)")
          .eq("user_id", user.id),
      ])

      const coachClubs: Club[] = coachRes.data || []
      const subClubs: Club[] = ((subsRes.data || []) as any[])
        .map((s) => s.clubs)
        .filter(Boolean)
      const clubMap = new Map<string, Club>()
      ;[...coachClubs, ...subClubs].forEach((c) => {
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
                "id, title, date, time, distance, meeting_point, description, is_in_person, members_only, club_id"
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
              "id, title, date, time, distance, meeting_point, description, is_in_person, members_only, club_id"
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

  const checkIn = useCallback(
    async (runId: string) => {
      if (!sessionToken || checkingInId) return
      setCheckingInId(runId)
      try {
        const res = await fetch("/api/checkin", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ run_id: runId }),
        })
        const data = await res.json()
        if (!res.ok) return
        setCheckedInIds((prev) => new Set([...prev, runId]))
        if (data.stats) {
          setStats(data.stats)
          setNextAch(computeNext(data.stats))
          if (data.unlocked) {
            setUnlocked((prev) => {
              const ids = new Set(prev.map((a) => a.id))
              const fresh = (data.unlocked as Achievement[]).filter((a) => !ids.has(a.id))
              return [...prev, ...fresh]
            })
          }
        }
        if (data.newAchievement) setNewAchievement(data.newAchievement)
      } finally {
        setCheckingInId(null)
      }
    },
    [sessionToken, checkingInId]
  )

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
              <div className="text-center px-5 py-3.5 rounded-2xl bg-[#2e3d1a] border border-[#3d5220] min-w-[80px]">
                <p className="text-2xl font-black text-white leading-none">{myKlubs.length}</p>
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mt-1">
                  Klubs
                </p>
              </div>
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
            <p className="text-white font-bold text-lg">Sign in to see your hub</p>
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
          <div className="flex flex-col md:grid md:grid-cols-[1fr_320px] md:gap-10 md:items-start">
            {/* ── RIGHT SIDEBAR ── */}
            <div className="order-1 md:order-2 space-y-8 mb-8 md:mb-0">
              {/* Stats strip */}
              {stats && (
                <StatsStrip stats={stats} nextAch={nextAch} unlocked={unlocked} />
              )}

              {/* Messages (members only — directors manage chats from their Director dashboard) */}
              {!isManager && (
                <section>
                  <SectionHeader title="Messages" sub="Chats from your upcoming runs" />
                  <MemberChatInbox userId={userId} />
                </section>
              )}

              {/* My Klubs */}
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
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 scrollbar-none md:overflow-visible md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-3 md:pb-0">
                    {myKlubs.map((club) => (
                      <Link
                        key={club.id}
                        href={`/clubs/${club.id}`}
                        className="flex flex-col items-center gap-2 shrink-0 w-[76px] md:w-auto group"
                      >
                        <div
                          className={`rk-card-hover w-[60px] h-[60px] md:w-full md:aspect-square md:h-auto rounded-2xl overflow-hidden flex items-center justify-center border border-[#3d5220] group-hover:border-[#c5f135]/60 bg-gradient-to-br ${getGradient(club.name)}`}
                        >
                          {club.image_url ? (
                            <img
                              src={club.image_url}
                              alt=""
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                            />
                          ) : (
                            <span className="text-base font-black text-white/30 select-none">
                              {club.name
                                .split(" ")
                                .map((w) => w[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-white/55 text-center leading-tight line-clamp-2 font-medium w-full">
                          {club.name}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* Director */}
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
                          <p className="text-sm font-bold text-white truncate">{club.name}</p>
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

            {/* ── LEFT / MAIN ── */}
            <div className="order-2 md:order-1 space-y-10">
              {/* ── MY TRAINING SCHEDULE ── */}
              {scheduleRuns.length > 0 && (
                <section>
                  <SectionHeader
                    title="My Training Schedule"
                    sub={`Week of ${weekLabel()}`}
                  />
                  <div className="space-y-3">
                    {scheduleRuns.map((run) => {
                      const isToday = run.date === todayStr
                      const canCheckIn = isToday && run.is_in_person
                      const checkedIn = checkedInIds.has(run.id)
                      const isChecking = checkingInId === run.id
                      return (
                        <div
                          key={run.id}
                          className={`bg-[#1e2d12] border rounded-2xl overflow-hidden ${
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
                                  {formatTime(run.time)}
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
                              {canCheckIn && (
                                <button
                                  onClick={() => !checkedIn && checkIn(run.id)}
                                  disabled={isChecking}
                                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-black transition ${
                                    checkedIn
                                      ? "bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30 cursor-default"
                                      : "bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] active:scale-95"
                                  }`}
                                >
                                  {checkedIn ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Checked In
                                    </>
                                  ) : isChecking ? (
                                    "…"
                                  ) : (
                                    "Check In"
                                  )}
                                </button>
                              )}
                            </div>
                            {run.description && (
                              <p className="text-xs text-white/50 mt-2 leading-relaxed">
                                {run.description}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

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
                      const canCheckIn = isToday && run.is_in_person
                      const checkedIn = checkedInIds.has(run.id)
                      const isChecking = checkingInId === run.id
                      const meta = [run.club_name, formatTime(run.time), run.distance]
                        .filter(Boolean)
                        .join(" · ")
                      return (
                        <div key={run.id} className="flex items-center gap-3 px-4 py-3.5">
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
                          {canCheckIn ? (
                            <button
                              onClick={() => !checkedIn && checkIn(run.id)}
                              disabled={isChecking}
                              className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-black transition ${
                                checkedIn
                                  ? "bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30 cursor-default"
                                  : "bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] active:scale-95"
                              }`}
                            >
                              {checkedIn ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3" /> Done
                                </>
                              ) : isChecking ? (
                                "…"
                              ) : (
                                "Check In"
                              )}
                            </button>
                          ) : (
                            <span
                              className={`shrink-0 text-[10px] font-bold ${
                                isToday ? "text-[#c5f135]" : "text-white/30"
                              }`}
                            >
                              {dayLabel}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        <div className="h-8" />
      </div>

      {/* ── ACHIEVEMENT TOAST ── */}
      {newAchievement && (
        <AchievementToast
          achievement={newAchievement}
          onDismiss={() => setNewAchievement(null)}
        />
      )}
    </div>
  )
}
