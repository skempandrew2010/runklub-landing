"use client"

import { useState, useEffect, useMemo } from "react"
import SearchBar from "@/components/searchbar"
import Filters, { DEFAULT_FILTERS, type FilterOptions } from "@/components/filters"
import dynamic from "next/dynamic"
const MapView = dynamic(() => import("@/components/mapview"), { ssr: false })
import ClubList from "@/components/clublist"
import LoginModal from "@/components/LoginModal"
import { supabase } from "@/lib/supabase"
import { Club } from "@/types/club"
import { getDistanceMiles } from "@/utils/distance"
import { localDateStr } from "@/utils/dates"
import { SlidersHorizontal, Map, List, CalendarCheck, Clock, MapPin, Mail, ChevronDown } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { getTagStyle } from "@/utils/tagStyle"

type SortOption = "closest" | "popular" | "newest"
type ClubWithExtras = Club & { distance?: number; nearestRunDist?: number; memberCount?: number }

type WeekRun = {
  id: string
  title: string
  date: string
  time: string
  distance: string | null
  meeting_point: string | null
  city: string | null
  run_lat: number | null
  run_lng: number | null
  tags: string[] | null
  club_id: string
  club_name: string
  club_image: string | null
  club_lat: number | null
  club_lng: number | null
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow"
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`
}

export default function Home() {
  const [city, setCity] = useState("")
  const [, setHoveredClub] = useState<string | null>(null)
  const [selectedClub, setSelectedClub] = useState<ClubWithExtras | null>(null)
  const [clubs, setClubs] = useState<ClubWithExtras[]>([])
  const [, setSubscriptions] = useState<ClubWithExtras[]>([])
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [cityCoords, setCityCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showMobileMap, setShowMobileMap] = useState(false)
  const [pendingAction, setPendingAction] = useState<null | (() => void)>(null)
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS)
  const [sortBy, setSortBy] = useState<SortOption>("closest")
  const PAGE_SIZE = 10
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [allWeekRuns, setAllWeekRuns] = useState<WeekRun[]>([])
  const [weekRunsLoading, setWeekRunsLoading] = useState(false)

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUserId(data.user?.id || null)
    }
    getUser()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const requireAuth = async (action?: () => void) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      if (action) setPendingAction(() => action)
      setShowAuthModal(true)
      return
    }
    if (action) action()
  }

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    )
  }, [])

  useEffect(() => {
    async function loadClubs() {
      const [{ data: clubData }, { data: subData }] = await Promise.all([
        supabase.from("clubs").select("id, name, city, latitude, longitude, location, image_url, tier, created_at").eq("is_public", true),
        supabase.from("subscriptions").select("club_id"),
      ])
      const countMap: Record<string, number> = {}
      subData?.forEach((s) => { countMap[s.club_id] = (countMap[s.club_id] || 0) + 1 })
      setClubs((clubData || []).map((club) => ({ ...club, memberCount: countMap[club.id] || 0 })))
    }
    loadClubs()
  }, [])

  useEffect(() => {
    if (!selectedClub) return
    const el = document.getElementById(`club-${selectedClub.id}`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [selectedClub])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [city, cityCoords])

  useEffect(() => {
    async function loadWeekRuns() {
      if (clubs.length === 0) return
      setWeekRunsLoading(true)

      const todayStr = localDateStr()
      const weekAhead = new Date()
      weekAhead.setDate(weekAhead.getDate() + 7)
      const weekStr = localDateStr(weekAhead)

      const { data } = await supabase
        .from("runs")
        .select("id, title, date, time, distance, meeting_point, city, run_lat, run_lng, tags, club_id")
        .in("club_id", clubs.map((c) => c.id))
        .gte("date", todayStr)
        .lte("date", weekStr)
        .eq("is_public", true)
        .order("date", { ascending: true })
        .order("time", { ascending: true })

      const clubLookup: Record<string, ClubWithExtras> = {}
      clubs.forEach((c) => { clubLookup[c.id] = c })

      setAllWeekRuns(
        (data || []).map((r) => ({
          ...r,
          club_name: clubLookup[r.club_id]?.name ?? "",
          club_image: clubLookup[r.club_id]?.image_url ?? null,
          club_lat: clubLookup[r.club_id]?.latitude ?? null,
          club_lng: clubLookup[r.club_id]?.longitude ?? null,
          run_lat: r.run_lat ?? null,
          run_lng: r.run_lng ?? null,
          city: r.city ?? null,
        }))
      )
      setWeekRunsLoading(false)
    }
    loadWeekRuns()
  }, [clubs])

  const center = cityCoords || userLocation

  const NEARBY_RADIUS = 50

  const nearestRunDistByClub = useMemo(() => {
    if (!center) return {} as Record<string, number>
    const map: Record<string, number> = {}
    allWeekRuns.forEach((run) => {
      const lat = run.run_lat ?? run.club_lat
      const lng = run.run_lng ?? run.club_lng
      if (lat == null || lng == null) return
      const dist = getDistanceMiles(center.lat, center.lng, lat, lng)
      if (map[run.club_id] == null || dist < map[run.club_id]) {
        map[run.club_id] = dist
      }
    })
    return map
  }, [center, allWeekRuns])

  const clubsWithDistance = clubs.map((club) => {
    if (!center) return { ...club }
    let clubDist: number | undefined
    if (club.latitude != null && club.longitude != null) {
      clubDist = getDistanceMiles(center.lat, center.lng, club.latitude, club.longitude)
    }
    const runDist = nearestRunDistByClub[club.id]
    const dist = runDist != null && (clubDist == null || runDist < clubDist) ? runDist : clubDist
    return { ...club, distance: dist, nearestRunDist: runDist }
  })

  const baseClubs = center
    ? clubsWithDistance.filter((c) => c.distance != null && c.distance <= NEARBY_RADIUS)
    : clubsWithDistance

  const filteredClubs = baseClubs
    .filter((club) => {
      if (club.distance != null) {
        const [dMin, dMax] = filters.distanceRange
        if (club.distance < dMin || (dMax < 25 && club.distance > dMax)) return false
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy === "popular") {
        return (b.memberCount ?? 0) - (a.memberCount ?? 0)
      }
      if (sortBy === "newest") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      if (a.nearestRunDist != null && b.nearestRunDist != null) return a.nearestRunDist - b.nearestRunDist
      if (a.nearestRunDist != null) return -1
      if (b.nearestRunDist != null) return 1
      if (a.distance != null && b.distance != null) return a.distance - b.distance
      if (a.distance != null) return -1
      if (b.distance != null) return 1
      return 0
    })

  const activeFilterCount = [
    filters.distanceRange[0] > 0 || filters.distanceRange[1] < 25,
    filters.paceRange[0] > 5 || filters.paceRange[1] < 15,
  ].filter(Boolean).length
  const nearbyClubIds = new Set(baseClubs.map((c) => c.id))
  const weekRuns = center
    ? allWeekRuns.filter((r) => {
        const lat = r.run_lat ?? r.club_lat
        const lng = r.run_lng ?? r.club_lng
        if (lat != null && lng != null) {
          return getDistanceMiles(center.lat, center.lng, lat, lng) <= 50
        }
        return nearbyClubIds.has(r.club_id)
      })
    : allWeekRuns

  const groupedWeekRuns: Record<string, WeekRun[]> = {}
  weekRuns.forEach((r) => {
    const label = formatDate(r.date)
    if (!groupedWeekRuns[label]) groupedWeekRuns[label] = []
    groupedWeekRuns[label].push(r)
  })

  const locationLabel = cityCoords && city ? `near "${city}"` : "near you"

  const heroSection = (
    <div className="bg-[#1a2110] px-5 pt-12 pb-10 text-center">
      <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight tracking-tight">
        Find your people.<br />
        <span className="text-[#c5f135] italic">Find your pace.</span>
      </h1>
      <p className="text-white/35 text-sm mt-4 max-w-sm mx-auto leading-relaxed">
        Discover verified run clubs near you and show up to your next run for free.
      </p>
      <div className="flex items-center justify-center gap-5 mt-7 flex-wrap">
        <div className="text-center">
          <p className="text-2xl font-black text-[#c5f135] leading-none">{clubs.length > 0 ? `${clubs.length}+` : "—"}</p>
          <p className="text-[10px] font-bold text-white/35 tracking-widest uppercase mt-1">Run Clubs</p>
        </div>
        <div className="w-px h-8 bg-[#2e3d1a]" />
        <div className="text-center">
          <p className="text-2xl font-black text-[#c5f135] leading-none">Weekly</p>
          <p className="text-[10px] font-bold text-white/35 tracking-widest uppercase mt-1">Runs</p>
        </div>
        <div className="w-px h-8 bg-[#2e3d1a]" />
        <div className="text-center">
          <p className="text-2xl font-black text-[#c5f135] leading-none">Free</p>
          <p className="text-[10px] font-bold text-white/35 tracking-widest uppercase mt-1">To Join</p>
        </div>
      </div>
    </div>
  )

  const filterBar = (
    <div className="bg-[#1a2110] border-b border-[#2e3d1a]">
      <div className="px-5 py-3 flex items-center gap-3">
        <div className="flex-1">
          <SearchBar city={city} setCity={setCity} onSearch={() => {}} />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-semibold transition shrink-0
            ${showFilters || activeFilterCount > 0
              ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]"
              : "text-white border-[#2e3d1a] hover:border-white/40"
            }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-[#1a2110] text-[#c5f135] text-xs flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>
      {showFilters && (
        <div className="border-t border-[#2e3d1a] px-5 py-3">
          <Filters onChange={setFilters} />
        </div>
      )}
    </div>
  )

  const nearbyLabel = cityCoords && city
    ? `near "${city}"`
    : userLocation
      ? "near you"
      : null

  const countRow = (
    <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm text-white/50">
          <span className="font-bold text-white">{filteredClubs.length}</span>{" "}
          {filteredClubs.length === 1 ? "club" : "clubs"}
          {nearbyLabel ? ` ${nearbyLabel}` : ""}
        </p>
        {!center && (
          <p className="text-xs text-white/25 mt-0.5">Search a city or share your location to see clubs near you</p>
        )}
      </div>
      <div className="relative shrink-0">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="appearance-none bg-[#1e2d12] border border-[#2e3d1a] text-white/80 text-sm font-semibold rounded-full pl-4 pr-8 py-2 focus:outline-none focus:border-[#c5f135]/50 cursor-pointer"
        >
          <option value="closest">Closest</option>
          <option value="popular">Most Popular</option>
          <option value="newest">Newest</option>
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
      </div>
    </div>
  )

  const remaining = filteredClubs.length - visibleCount

  const clubListSection = (
    <>
      <ClubList
        setHoveredClub={setHoveredClub}
        setSelectedClub={setSelectedClub}
        selectedClub={selectedClub}
        clubs={filteredClubs.slice(0, visibleCount)}
        setFavorites={setSubscriptions}
        userId={userId}
        requireAuth={requireAuth}
      />
      {remaining > 0 && (
        <div className="px-5 pb-5 pt-2">
          <button
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="w-full py-3 rounded-2xl border border-[#2e3d1a] bg-[#1e2d12] text-sm font-bold text-white/60 hover:text-white hover:border-[#c5f135]/40 transition"
          >
            Show {Math.min(PAGE_SIZE, remaining)} more clubs
          </button>
        </div>
      )}
    </>
  )

  const weekScheduleSection = (
    <div className="px-6 py-8">
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-base font-black text-white tracking-tight">Runs This Week</h2>
        {center && (
          <span className="text-[11px] text-white/30 font-medium">within 50 mi {locationLabel}</span>
        )}
      </div>

      {weekRunsLoading && (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
        </div>
      )}

      {!weekRunsLoading && weekRuns.length === 0 && (
        <div className="bg-[#1e2d12] rounded-2xl p-6 text-center">
          <CalendarCheck className="w-8 h-8 text-white/20 mx-auto mb-2" />
          <p className="text-white/40 text-sm">
            {center ? "No runs scheduled nearby this week." : "No runs scheduled this week."}
          </p>
          {!center && (
            <p className="text-white/25 text-xs mt-1">Search a city or enable location to filter by distance.</p>
          )}
        </div>
      )}

      {!weekRunsLoading && weekRuns.length > 0 && (
        <div className="space-y-5">
          {Object.entries(groupedWeekRuns).map(([dateLabel, dayRuns]) => (
            <div key={dateLabel}>
              <p className="text-[11px] font-bold text-[#c5f135]/70 tracking-widest uppercase mb-2 px-1">
                {dateLabel}
              </p>
              <div className="bg-[#1e2d12] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">
                {dayRuns.map((run) => (
                  <div key={run.id} className="px-4 py-3.5 flex items-start gap-3">
                    <div className="relative w-9 h-9 rounded-xl bg-[#2e3d1a] shrink-0 overflow-hidden flex items-center justify-center">
                      {run.club_image ? (
                        <Image src={run.club_image} alt="" fill sizes="36px" className="object-cover" />
                      ) : (
                        <span className="text-[10px] font-black text-white/50">
                          {run.club_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white leading-tight">{run.title}</p>
                      <p className="text-[11px] text-[#c5f135]/80 font-medium mt-0.5">{run.club_name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                        <span className="flex items-center gap-1 text-xs text-white/50">
                          <Clock className="w-3 h-3" /> {formatTime(run.time)}
                        </span>
                        {run.meeting_point && (
                          <span className="flex items-center gap-1 text-xs text-white/50">
                            <MapPin className="w-3 h-3" /> {run.meeting_point}
                          </span>
                        )}
                        {run.distance && (
                          <span className="text-xs text-white/40">{run.distance}</span>
                        )}
                      </div>
                      {run.tags && run.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {run.tags.map((tag) => (
                            <span
                              key={tag}
                              className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${getTagStyle(tag)}`}
                            >
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
          ))}
        </div>
      )}
    </div>
  )

  const footerSection = (
    <div className="border-t border-[#2e3d1a] px-6 pt-8 pb-6 space-y-5">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black text-white">
            Run<span className="text-[#c5f135]">Klub</span>
          </p>
          <p className="text-xs text-white/30 mt-0.5">Find verified run clubs anywhere.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <a
            href="https://www.instagram.com/runklubapp/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1e2d12] border border-[#2e3d1a] text-white/60 hover:text-white hover:border-[#c5f135]/40 transition text-xs font-semibold"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
            </svg>
            @runklubapp
          </a>
          <a
            href="mailto:runklubinfo@gmail.com"
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1e2d12] border border-[#2e3d1a] text-white/60 hover:text-white hover:border-[#c5f135]/40 transition text-xs font-semibold"
          >
            <Mail className="w-3.5 h-3.5" />
            runklubinfo@gmail.com
          </a>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#2e3d1a]">
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          <Link href="/terms" className="text-xs text-white/25 hover:text-white/50 transition">Terms of Service</Link>
          <Link href="/privacy" className="text-xs text-white/25 hover:text-white/50 transition">Privacy Policy</Link>
          <Link href="/community" className="text-xs text-white/25 hover:text-white/50 transition">Community Guidelines</Link>
        </div>
        <p className="text-xs text-white/15">© {new Date().getFullYear()} RunKlub</p>
      </div>
    </div>
  )

  return (
    <>
      {/* ── MOBILE ───────────────────────────────────────────────────── */}
      <div className="md:hidden bg-[#1a2110]">
        {!showMobileMap && heroSection}

        <div className="sticky top-[65px] z-40">
          {filterBar}
        </div>

        {showMobileMap ? (
          <>
            <div className="fixed left-0 right-0 z-10" style={{ top: "65px", bottom: "0" }}>
              <MapView
                city={city}
                runs={weekRuns}
                onCityCoords={setCityCoords}
              />
            </div>
            <button
              onClick={() => setShowMobileMap(false)}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-5 py-2.5 bg-[#1a2110] border border-[#3d5220] rounded-full text-white font-semibold text-sm shadow-xl shadow-black/60"
            >
              <List className="w-4 h-4" /> Show list
            </button>
          </>
        ) : (
          <>
            {countRow}
            {clubListSection}

            <div className="mt-4 border-t-2 border-[#2e3d1a]">
              {weekScheduleSection}
            </div>
            {footerSection}
            <div className="h-24" />

            <button
              onClick={() => setShowMobileMap(true)}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-5 py-2.5 bg-[#1a2110] border border-[#3d5220] rounded-full text-white font-semibold text-sm shadow-xl shadow-black/60"
            >
              <Map className="w-4 h-4" /> Map
            </button>
          </>
        )}
      </div>

      {/* ── DESKTOP ──────────────────────────────────────────────────── */}
      <div className="hidden md:block bg-[#1a2110]">
        {heroSection}

        <div className="sticky top-[65px] z-40">
          {filterBar}
        </div>

        <div className="flex">
          <div className="w-[58%] min-h-[calc(100vh-65px)] border-r border-[#2e3d1a]">
            {countRow}
            {clubListSection}
            <div className="h-8" />
          </div>

          <div className="w-[42%] shrink-0">
            <div className="sticky top-[65px]" style={{ height: "calc(100vh - 65px)" }}>
              <MapView
                city={city}
                runs={weekRuns}
                onCityCoords={setCityCoords}
              />
            </div>
          </div>
        </div>

        <div className="border-t-2 border-[#2e3d1a]">
          <div className="max-w-4xl mx-auto">
            {weekScheduleSection}
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          {footerSection}
        </div>
        <div className="h-6" />
      </div>

      {showAuthModal && (
        <LoginModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => {
            setShowAuthModal(false)
            if (pendingAction) {
              pendingAction()
              setPendingAction(null)
            }
          }}
        />
      )}
    </>
  )
}
