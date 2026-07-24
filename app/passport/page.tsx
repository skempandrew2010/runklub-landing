"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Stamp, Flame, MapPin, Users2, CalendarCheck, ChevronLeft, ChevronRight, Home, Plane, Trophy } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  getPassportData,
  getUserPassportProgress,
  getPassportBook,
  getCityLeaderboard,
  computeCheckinStreak,
  type CityProgress,
  type BookPage,
} from "@/lib/checkins"
import Leaderboard from "@/components/Leaderboard"

const GRADIENTS = [
  "from-[#2d5a1b] to-[#111a0a]", "from-[#1b3d5a] to-[#111a0a]",
  "from-[#5a3d1b] to-[#111a0a]", "from-[#3d1b5a] to-[#111a0a]",
  "from-[#1b5a3d] to-[#111a0a]", "from-[#5a2b1b] to-[#111a0a]",
]
function getGradient(name: string) {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  return GRADIENTS[hash % GRADIENTS.length]
}
function cityAbbr(name: string) {
  const words = name.split(" ").filter(Boolean)
  if (words.length > 1) return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
function clubAbbr(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

type JustUnlocked = { clubIds: string[]; cityIds: string[] }

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="flex-1 bg-[#0e150a] rounded-xl px-3 py-3 text-center border border-[#2e3d1a] min-w-0">
      <div className="flex items-center justify-center gap-1 text-[#c5f135]">{icon}</div>
      <p className="text-xl font-black text-white leading-none mt-1">{value}</p>
      <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1 truncate">{label}</p>
    </div>
  )
}

function PassportSummary({
  streak,
  stampedCityCount,
  totalCityCount,
  clubCount,
  totalCheckins,
}: {
  streak: number
  stampedCityCount: number
  totalCityCount: number
  clubCount: number
  totalCheckins: number
}) {
  return (
    <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4 mb-6">
      <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3">Your Stats</p>
      <div className="flex gap-3">
        <StatTile icon={<Flame className="w-3 h-3" />} value={streak} label="Day Streak" />
        <StatTile icon={<MapPin className="w-3 h-3" />} value={`${stampedCityCount}/${totalCityCount}`} label="Cities" />
        <StatTile icon={<Users2 className="w-3 h-3" />} value={clubCount} label="Klubs" />
        <StatTile icon={<CalendarCheck className="w-3 h-3" />} value={totalCheckins} label="Check-Ins" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-[#2e3d1a]">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-gradient-to-br from-[#2d5a1b] to-[#111a0a] border border-[#3d5220] shrink-0" />
          <span className="text-[10px] text-white/40">Stamped</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border border-dashed border-white/20 shrink-0" />
          <span className="text-[10px] text-white/40">Not visited</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Home className="w-3 h-3 text-[#c5f135]" />
          <span className="text-[10px] text-white/40">Home klub</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Plane className="w-3 h-3 text-white/40" />
          <span className="text-[10px] text-white/40">Travel stamp</span>
        </div>
      </div>
    </div>
  )
}

function GoalBox({
  label,
  city,
  emptyHint,
}: {
  label: string
  city: CityProgress | null
  emptyHint: string
}) {
  if (!city) {
    return (
      <div className="rounded-2xl p-4 bg-[#1e2d12] border border-[#2e3d1a] h-full flex flex-col">
        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">{label}</p>
        <p className="text-xs text-white/40 leading-snug my-auto">{emptyHint}</p>
      </div>
    )
  }

  const pct = city.total_clubs > 0 ? Math.round((city.stamped_clubs / city.total_clubs) * 100) : 0

  const body = (
    <div className="rounded-2xl p-4 bg-gradient-to-br from-[#28380f] via-[#1a2110] to-[#0e150a] border border-[#c5f135]/25 h-full flex flex-col">
      <p className="text-[9px] font-black text-[#c5f135] uppercase tracking-widest mb-2">{label}</p>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center border-2 border-[#c5f135]/40 bg-black/30 shrink-0">
          {city.flag_asset_url ? (
            <img src={city.flag_asset_url} alt="" className="w-full h-full object-cover rounded-full" />
          ) : (
            <span className="text-xs font-black text-white/80">{cityAbbr(city.city_name)}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-white leading-tight truncate">
            {city.city_name}{city.city_state ? `, ${city.city_state}` : ""}
          </p>
          <p className="text-[10px] text-white/50">{city.stamped_clubs}/{city.total_clubs} klubs</p>
        </div>
      </div>
      <div className="mt-auto">
        <p className="text-xs text-white/70 mb-2">
          {city.is_complete ? (
            <span className="text-[#c5f135] font-bold">Complete! 🎉</span>
          ) : city.remaining === 1 ? (
            <span className="text-[#c5f135] font-bold">Find a club to complete this city</span>
          ) : (
            <><span className="text-[#c5f135] font-bold">{city.remaining}</span> to go</>
          )}
        </p>
        <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
          <div className="h-full bg-[#c5f135] rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )

  const cityLabel = city.city_name + (city.city_state ? `, ${city.city_state}` : "")
  return (
    <Link href={`/explore?city=${encodeURIComponent(cityLabel)}`} className="block h-full">
      {body}
    </Link>
  )
}

function CompletedCitiesRow({ cities, onJump }: { cities: CityProgress[]; onJump: (cityId: string) => void }) {
  if (cities.length === 0) return null
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <Trophy className="w-4 h-4 text-[#c5f135]" />
        <h2 className="text-sm font-black text-white tracking-tight">Completed ({cities.length})</h2>
        <div className="flex-1 h-px bg-[#2e3d1a]" />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {cities.map((c) => {
          const gradient = getGradient(c.city_name)
          return (
            <button
              key={c.city_id}
              onClick={() => onJump(c.city_id)}
              className="flex flex-col items-center gap-1.5 shrink-0 w-16 text-center"
            >
              <div className={`relative w-14 h-14 rounded-full flex items-center justify-center border-2 border-[#c5f135] bg-gradient-to-br ${gradient} shadow-lg shadow-black/30`}>
                {c.flag_asset_url ? (
                  <img src={c.flag_asset_url} alt="" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <span className="text-xs font-black text-white/90">{cityAbbr(c.city_name)}</span>
                )}
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#c5f135] flex items-center justify-center">
                  <Trophy className="w-2.5 h-2.5 text-[#1a2110]" />
                </span>
              </div>
              <p className="text-[9px] text-white/60 font-semibold leading-tight line-clamp-2">{c.city_name}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StampSlot({ slot, isNew }: { slot: BookPage["slots"][number]; isNew: boolean }) {
  const gradient = getGradient(slot.club_name)
  return (
    <Link href={`/clubs/${slot.club_id}`} className="flex flex-col items-center gap-1.5 text-center group">
      <div className="relative">
        <div
          className={`w-16 h-16 rounded-full overflow-hidden flex items-center justify-center border-2 transition-transform duration-300 group-hover:scale-105 group-active:scale-95 ${
            slot.stamped
              ? `bg-gradient-to-br ${gradient} border-[#3d5220] shadow-lg shadow-black/30`
              : "border-dashed border-white/15 bg-transparent opacity-40 group-hover:opacity-70"
          } ${isNew ? "ring-2 ring-[#c5f135] animate-pulse" : ""}`}
        >
          {slot.stamped && slot.club_image_url ? (
            <img src={slot.club_image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className={`text-sm font-black ${slot.stamped ? "text-white/80" : "text-white/20"}`}>
              {clubAbbr(slot.club_name)}
            </span>
          )}
        </div>
        {slot.stamped && (
          <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#1a2110] border border-[#3d5220] flex items-center justify-center">
            {slot.is_home ? (
              <Home className="w-2.5 h-2.5 text-[#c5f135]" />
            ) : (
              <Plane className="w-2.5 h-2.5 text-white/50" />
            )}
          </span>
        )}
        {isNew && (
          <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110] text-[7px] font-black tracking-wide">
            NEW
          </span>
        )}
      </div>
      <p className={`text-[10px] leading-tight line-clamp-2 ${slot.stamped ? "text-white/80 font-semibold group-hover:text-[#c5f135]" : "text-white/25"}`}>
        {slot.club_name}
      </p>
    </Link>
  )
}

function PassportBookPage({ page, justUnlocked, userId }: { page: BookPage; justUnlocked: JustUnlocked; userId: string | null }) {
  const cityIsNew = justUnlocked.cityIds.includes(page.city_id)
  return (
    <div className="rk-book-page shrink-0 w-full px-1 flex flex-col md:flex-row gap-4 items-stretch">
      <div className="relative rk-book-page-surface bg-[#1e2d12] rounded-2xl p-5 min-h-[360px] flex-1 min-w-0">
        <div className="absolute inset-y-0 left-0 w-6 rk-book-spine rounded-l-2xl pointer-events-none" />
        <div className="flex items-center gap-3 mb-5">
          <div className={`relative w-11 h-11 rounded-full overflow-hidden flex items-center justify-center border-2 border-[#3d5220] bg-[#0e150a] shrink-0 ${cityIsNew ? "ring-2 ring-[#c5f135] animate-pulse" : ""}`}>
            {page.flag_asset_url ? (
              <img src={page.flag_asset_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-black text-[#c5f135]">{cityAbbr(page.city_name)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black text-white leading-tight truncate">
              {page.city_name}{page.city_state ? `, ${page.city_state}` : ""}
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              {page.stamped_count}/{page.total_count} klubs {page.is_complete && <span className="text-[#c5f135] font-bold">· Complete!</span>}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-x-3 gap-y-5">
          {page.slots.map((slot) => (
            <StampSlot key={slot.club_id} slot={slot} isNew={justUnlocked.clubIds.includes(slot.club_id)} />
          ))}
        </div>
      </div>

      <div className="bg-[#1e2d12] rounded-2xl p-5 min-h-[360px] flex-1 min-w-0">
        <Leaderboard
          title={`${page.city_name} Leaderboard`}
          userId={userId}
          fetchRows={(scope) => getCityLeaderboard(page.city_id, scope)}
          guestCopy="Sign in to see who's leading in this city."
          emptyCopy={(scope) => scope === "month" ? "No check-ins yet this month — be the first!" : "No check-ins yet in this city."}
        />
      </div>
    </div>
  )
}

export default function PassportPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [progress, setProgress] = useState<CityProgress[]>([])
  const [book, setBook] = useState<BookPage[]>([])
  const [clubStampCount, setClubStampCount] = useState(0)
  const [checkinDates, setCheckinDates] = useState<string[]>([])
  const [totalCheckins, setTotalCheckins] = useState(0)
  const [justUnlocked, setJustUnlocked] = useState<JustUnlocked>({ clubIds: [], cityIds: [] })
  const [loading, setLoading] = useState(true)
  const [activePage, setActivePage] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Passport is member-only — directors manage klubs from their Director dashboard
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
        if (profile?.role === "manager") { router.replace("/today"); return }
      }
      setUserId(user?.id ?? null)
      if (user) {
        const [passportData, progressData, bookData] = await Promise.all([
          getPassportData(),
          getUserPassportProgress(),
          getPassportBook(),
        ])
        setCheckinDates(passportData.checkinDates)
        setTotalCheckins(passportData.totalCheckins)
        setClubStampCount(passportData.clubCheckIns.length)
        setProgress(progressData)
        setBook(bookData)

        try {
          const raw = sessionStorage.getItem("runklub_just_unlocked")
          if (raw) {
            setJustUnlocked(JSON.parse(raw))
            sessionStorage.removeItem("runklub_just_unlocked")
          }
        } catch { /* sessionStorage unavailable — unlock animation is a nice-to-have */ }
      }
      setLoading(false)
    }
    load()
  }, [])

  const streak = useMemo(() => computeCheckinStreak(checkinDates), [checkinDates])
  const homeCity = progress.find((c) => c.is_home_city) ?? null
  const nextCity = progress.find((c) => c.is_nearest_incomplete) ?? null
  const completedCities = useMemo(() => progress.filter((c) => c.is_complete), [progress])

  const scrollToPage = (index: number) => {
    const el = scrollerRef.current
    if (!el) return
    const clamped = Math.max(0, Math.min(index, book.length - 1))
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" })
  }

  const jumpToCity = (cityId: string) => {
    const idx = book.findIndex((p) => p.city_id === cityId)
    if (idx >= 0) scrollToPage(idx)
  }

  const handleScroll = () => {
    const el = scrollerRef.current
    if (!el || el.clientWidth === 0) return
    setActivePage(Math.round(el.scrollLeft / el.clientWidth))
  }

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-[#c5f135]/10 border border-[#c5f135]/25 flex items-center justify-center shrink-0">
            <Stamp className="w-4 h-4 text-[#c5f135]" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white leading-tight">Passport</h1>
            <p className="text-xs text-white/40 mt-0.5">
              {book.length} of {progress.length} cities · {clubStampCount} klub{clubStampCount === 1 ? "" : "s"} stamped
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
          </div>
        ) : !userId ? (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-6 text-center">
            <p className="text-white font-bold text-sm mb-1">Sign in to see your Passport</p>
            <p className="text-white/40 text-xs mb-4">Check in at klubs to start collecting stamps.</p>
            <button
              onClick={() => router.push("/login")}
              className="px-6 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition"
            >
              Log In
            </button>
          </div>
        ) : progress.length === 0 ? (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
            <Stamp className="w-10 h-10 text-white/15 mx-auto mb-3" />
            <p className="text-white font-bold text-sm mb-1">No stamps yet</p>
            <p className="text-white/40 text-xs mb-4">Check in at a klub to collect your first stamp.</p>
            <Link
              href="/explore"
              className="inline-block px-6 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition"
            >
              Discover Klubs
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <GoalBox label="Home City" city={homeCity} emptyHint="Check in at your home klub to set this goal." />
              <GoalBox label="Next City" city={nextCity} emptyHint="Discover a new city to chase next." />
            </div>

            <CompletedCitiesRow cities={completedCities} onJump={jumpToCity} />

            <PassportSummary
              streak={streak}
              stampedCityCount={book.length}
              totalCityCount={progress.length}
              clubCount={clubStampCount}
              totalCheckins={totalCheckins}
            />

            {book.length === 0 ? (
              <p className="text-white/30 text-xs text-center py-10">
                Check in at a klub to open your first passport page.
              </p>
            ) : (
              <section>
                {book.length > 1 && (
                  <div className="flex items-center justify-center gap-3 mb-3">
                    {completedCities.length > 0 && (
                      <button
                        onClick={() => scrollToPage(activePage - 1)}
                        disabled={activePage === 0}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-[#2e3d1a] hover:text-white transition disabled:opacity-20 disabled:hover:bg-transparent"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    )}
                    <div className="flex items-center gap-1.5">
                      {book.map((p, i) => (
                        <button
                          key={p.city_id}
                          onClick={() => scrollToPage(i)}
                          className={`rounded-full transition-all ${
                            i === activePage
                              ? "w-4 h-1.5 bg-[#c5f135]"
                              : p.is_complete
                                ? "w-1.5 h-1.5 bg-[#c5f135]/60"
                                : "w-1.5 h-1.5 bg-white/20"
                          }`}
                          aria-label={`Go to ${p.city_name}`}
                        />
                      ))}
                    </div>
                    {completedCities.length > 0 && (
                      <button
                        onClick={() => scrollToPage(activePage + 1)}
                        disabled={activePage === book.length - 1}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-[#2e3d1a] hover:text-white transition disabled:opacity-20 disabled:hover:bg-transparent"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}

                <div
                  ref={scrollerRef}
                  onScroll={handleScroll}
                  className="rk-book-scroller flex overflow-x-auto -mx-1"
                >
                  {book.map((page) => (
                    <PassportBookPage key={page.city_id} page={page} justUnlocked={justUnlocked} userId={userId} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
