"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { localDateStr } from "@/utils/dates"
import { CalendarCheck, Clock, ChevronRight, Users, Zap } from "lucide-react"
import Link from "next/link"

type Club = {
  id: string
  name: string
  image_url: string | null
  meeting_day: string | null
  city: string | null
  user_id: string
}

type Run = {
  id: string
  title: string
  date: string
  time: string
  distance: string | null
  meeting_point: string | null
  tags: string[] | null
  club_id: string
  club_name?: string
  club_image?: string | null
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-5 rounded-full bg-[#c5f135] shrink-0" />
      <h2 className="text-sm font-black text-white tracking-tight">{title}</h2>
      {count !== undefined && (
        <span className="text-xs font-bold text-white/30">{count}</span>
      )}
      <div className="flex-1 h-px bg-[#2e3d1a]" />
    </div>
  )
}

function DateChip({ dateStr }: { dateStr: string }) {
  const d = new Date(dateStr + "T00:00:00")
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  const isTomorrow = d.toDateString() === new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toDateString()
  const label = isToday ? "Today" : isTomorrow ? "Tmrw" : d.toLocaleDateString("en-US", { weekday: "short" })
  return (
    <div suppressHydrationWarning className={`shrink-0 w-11 rounded-xl flex flex-col items-center justify-center py-1.5 gap-0.5 ${isToday ? "bg-[#c5f135]" : "bg-[#2e3d1a]"}`}>
      <span suppressHydrationWarning className={`text-[9px] font-black uppercase tracking-wider leading-none ${isToday ? "text-[#1a2110]" : "text-white/40"}`}>{label}</span>
      <span suppressHydrationWarning className={`text-lg font-black leading-none ${isToday ? "text-[#1a2110]" : "text-white"}`}>{d.getDate()}</span>
    </div>
  )
}

const GRADIENTS = [
  "from-[#2d5a1b] to-[#111a0a]",
  "from-[#1b3d5a] to-[#111a0a]",
  "from-[#5a3d1b] to-[#111a0a]",
  "from-[#3d1b5a] to-[#111a0a]",
  "from-[#1b5a3d] to-[#111a0a]",
  "from-[#5a2b1b] to-[#111a0a]",
]
function getGradient(name: string) {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return GRADIENTS[hash % GRADIENTS.length]
}

export default function HubPage() {
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [role, setRole] = useState<string>("member")
  const [myKlubs, setMyKlubs] = useState<Club[]>([])
  const [managedKlubs, setManagedKlubs] = useState<Club[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from("profiles").select("display_name, role").eq("id", user.id).single()

      setDisplayName(profile?.display_name || user.email?.split("@")[0] || null)
      const userRole = profile?.role || "member"
      setRole(userRole)

      const todayStr = localDateStr()
      const weekAhead = new Date()
      weekAhead.setDate(weekAhead.getDate() + 7)
      const weekStr = localDateStr(weekAhead)

      const [coachRes, subsRes] = await Promise.all([
        supabase.from("clubs").select("id, name, image_url, meeting_day, city, user_id").eq("user_id", user.id),
        supabase.from("subscriptions").select("clubs(id, name, image_url, meeting_day, city, user_id)").eq("user_id", user.id),
      ])

      const coachClubs: Club[] = coachRes.data || []
      const subClubs: Club[] = ((subsRes.data || []) as any[]).map((s) => s.clubs).filter(Boolean)

      const clubMap = new Map<string, Club>()
      ;[...coachClubs, ...subClubs].forEach((c) => { if (!clubMap.has(c.id)) clubMap.set(c.id, c) })
      const allClubs = Array.from(clubMap.values())
      setMyKlubs(allClubs)
      if (userRole === "manager") setManagedKlubs(coachClubs)

      const clubIds = allClubs.map((c) => c.id)
      if (clubIds.length > 0) {
        const { data: upcomingRuns } = await supabase
          .from("runs")
          .select("id, title, date, time, distance, meeting_point, tags, club_id")
          .in("club_id", clubIds)
          .gte("date", todayStr)
          .lte("date", weekStr)
          .order("date", { ascending: true })
          .order("time", { ascending: true })

        setRuns((upcomingRuns || []).map((r) => ({
          ...r,
          club_name: clubMap.get(r.club_id)?.name,
          club_image: clubMap.get(r.club_id)?.image_url,
        })))
      }
      setLoading(false)
    }
    load()
  }, [])

  const groupedByDate: Record<string, Run[]> = {}
  runs.forEach((r) => {
    if (!groupedByDate[r.date]) groupedByDate[r.date] = []
    groupedByDate[r.date].push(r)
  })

  const isManager = role === "manager"
  const firstName = displayName?.split(" ")[0] ?? null
  const todayStr = localDateStr()

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
            {!loading && userId && (
              <p className="text-sm text-white/40 mt-1.5">
                {runs.length === 0
                  ? "No runs scheduled from your klubs this week."
                  : <>{`You have `}<span className="text-white font-semibold">{runs.length}</span>{` run${runs.length !== 1 ? "s" : ""} coming up this week.`}</>
                }
              </p>
            )}
          </div>

          {/* Stat chips — only shown when logged in and loaded */}
          {!loading && userId && (
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-center px-5 py-3.5 rounded-2xl bg-[#2e3d1a] border border-[#3d5220] min-w-[80px]">
                <p className="text-2xl font-black text-white leading-none">{myKlubs.length}</p>
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mt-1">Klubs</p>
              </div>
              <div className="text-center px-5 py-3.5 rounded-2xl bg-[#2e3d1a] border border-[#3d5220] min-w-[80px]">
                <p className="text-2xl font-black text-[#c5f135] leading-none">{runs.length}</p>
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mt-1">Runs</p>
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
            <p className="text-white/40 text-sm mt-1">Your klubs and upcoming runs will appear here.</p>
            <Link href="/login" className="mt-5 inline-block px-6 py-3 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition">
              Sign In
            </Link>
          </div>
        )}

        {!loading && userId && (
          /* Two-column on desktop: right sidebar (My Klubs + Director) first in DOM for mobile order,
             then This Week. CSS order reverses them on desktop. */
          <div className="flex flex-col md:grid md:grid-cols-[1fr_320px] md:gap-10 md:items-start">

            {/* ── RIGHT SIDEBAR: My Klubs + Director ── */}
            {/* order-1 = first on mobile; md:order-2 = right column on desktop */}
            <div className="order-1 md:order-2 space-y-8 mb-8 md:mb-0">

              {/* My Klubs */}
              <section>
                <SectionHeader title="My Klubs" count={myKlubs.length} />
                {myKlubs.length === 0 ? (
                  <div className="bg-[#1e2d12] rounded-2xl p-6 text-center border border-[#2e3d1a]">
                    <p className="text-white/50 text-sm font-medium">No klubs yet.</p>
                    <p className="text-white/25 text-xs mt-1">Find a club near you to get started.</p>
                    <Link href="/" className="mt-4 inline-block px-4 py-2 bg-[#c5f135] text-[#1a2110] text-xs font-black rounded-full hover:bg-[#d4ff45] transition">
                      Discover Klubs
                    </Link>
                  </div>
                ) : (
                  /* Horizontal scroll on mobile, wrapping grid on desktop */
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 scrollbar-none md:overflow-visible md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-3 md:pb-0">
                    {myKlubs.map((club) => (
                      <Link
                        key={club.id}
                        href={`/clubs/${club.id}`}
                        className="flex flex-col items-center gap-2 shrink-0 w-[76px] md:w-auto group"
                      >
                        <div className={`w-[60px] h-[60px] md:w-full md:aspect-square md:h-auto rounded-2xl overflow-hidden flex items-center justify-center border border-[#3d5220] group-hover:border-[#c5f135]/60 transition-colors bg-gradient-to-br ${getGradient(club.name)}`}>
                          {club.image_url ? (
                            <img src={club.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-base font-black text-white/30 select-none">
                              {club.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
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
                      <span className="text-[10px] font-black text-[#c5f135]">{managedKlubs.length}</span>
                    </div>
                    <div className="flex-1 h-px bg-[#2e3d1a]" />
                  </div>
                  <div className="rounded-2xl overflow-hidden border border-[#c5f135]/15 bg-[#c5f135]/[0.03] divide-y divide-[#2e3d1a]">
                    {managedKlubs.map((club) => (
                      <div key={club.id} className="px-4 py-4 flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-xl shrink-0 overflow-hidden flex items-center justify-center border border-[#3d5220] bg-gradient-to-br ${getGradient(club.name)}`}>
                          {club.image_url ? (
                            <img src={club.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-black text-white/30">
                              {club.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{club.name}</p>
                          {club.city && <p className="text-xs text-white/40 mt-0.5">{club.city}</p>}
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

            {/* ── LEFT / MAIN: This Week ── */}
            {/* order-2 = second on mobile; md:order-1 = left column on desktop */}
            <div className="order-2 md:order-1">
              <SectionHeader title="This Week" count={runs.length} />

              {Object.keys(groupedByDate).length === 0 ? (
                <div className="bg-[#1e2d12] rounded-2xl p-10 text-center border border-[#2e3d1a]">
                  <CalendarCheck className="w-10 h-10 text-white/15 mx-auto mb-3" />
                  <p className="text-white/50 text-sm font-medium">No runs scheduled this week.</p>
                  <p className="text-white/25 text-xs mt-1">
                    {myKlubs.length === 0 ? "Join a klub to see their upcoming runs." : "Check back when your klubs post their next run."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedByDate).map(([dateStr, dayRuns]) => {
                    const isToday = dateStr === todayStr
                    return (
                      <div
                        key={dateStr}
                        className={`rounded-2xl overflow-hidden border ${isToday ? "border-[#c5f135]/20 bg-[#c5f135]/[0.04]" : "border-[#2e3d1a] bg-[#1e2d12]"}`}
                      >
                        {/* Day header */}
                        <div className={`flex items-center gap-3 px-4 py-3 border-b ${isToday ? "border-[#c5f135]/15" : "border-[#2e3d1a]"}`}>
                          <DateChip dateStr={dateStr} />
                          <div>
                            <p className={`text-sm font-black leading-tight ${isToday ? "text-[#c5f135]" : "text-white"}`}>
                              {isToday ? "Today" : new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                            </p>
                            <p className="text-xs text-white/30">{dayRuns.length} run{dayRuns.length !== 1 ? "s" : ""}</p>
                          </div>
                        </div>

                        {/* Runs */}
                        <div className="divide-y divide-[#2e3d1a]/60">
                          {dayRuns.map((run) => (
                            <div key={run.id} className="px-4 py-4 flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-[#2e3d1a] shrink-0 overflow-hidden flex items-center justify-center mt-0.5">
                                {run.club_image ? (
                                  <img src={run.club_image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[10px] font-black text-white/40">
                                    {run.club_name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white leading-tight">{run.title}</p>
                                <p className="text-[11px] text-[#c5f135]/70 font-semibold mt-0.5">{run.club_name}</p>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                                  <span className="flex items-center gap-1 text-xs text-white/45">
                                    <Clock className="w-3 h-3" /> {formatTime(run.time)}
                                  </span>
                                  {run.meeting_point && (
                                    <span className="text-xs text-white/35 truncate">{run.meeting_point}</span>
                                  )}
                                  {run.distance && (
                                    <span className="text-xs text-white/35">{run.distance}</span>
                                  )}
                                </div>
                                {run.tags && run.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {run.tags.map((tag) => (
                                      <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#2e3d1a] text-[#c5f135]/65 border border-[#3d5220]">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
