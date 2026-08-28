"use client"

import { useState, useEffect, useMemo, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
import { formatRunTime } from "@/lib/timezone"
import { SlidersHorizontal, CalendarCheck, Clock, MapPin, Lock, Crown } from "lucide-react"
import Image from "next/image"
import { getTagStyle } from "@/utils/tagStyle"
import { Select } from "@/components/Select"

type SortOption = "closest" | "popular" | "newest"
type RunSortOption = "time" | "closest"
type ExploreTab = "runs" | "klubs"
type ClubWithExtras = Club & { distance?: number; nearestRunDist?: number; memberCount?: number }

// Non-public test club - visible in local dev so it can be used for testing, hidden in production
const TEST_CLUB_ID = "58293726-a7d4-4395-9ad3-e72ee5b76d01"
const isLocalDev = process.env.NODE_ENV === "development"

type WeekRun = {
  id: string
  title: string
  date: string
  time: string
  timezone: string | null
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

function formatTime(run: WeekRun) {
  return formatRunTime(run)
}

export default function ExplorePage() {
  return (
    <Suspense fallback={null}>
      <ExplorePageInner />
    </Suspense>
  )
}

function ExplorePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Deep link from Passport goal boxes: /explore?city=Denver, CO
  const [city, setCity] = useState(() => searchParams.get("city") ?? "")
  const [, setHoveredClub] = useState<string | null>(null)
  const [selectedClub, setSelectedClub] = useState<ClubWithExtras | null>(null)
  const [clubs, setClubs] = useState<ClubWithExtras[]>([])
  const [, setSubscriptions] = useState<ClubWithExtras[]>([])
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [cityCoords, setCityCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [pendingAction, setPendingAction] = useState<null | (() => void)>(null)
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS)
  const [passportOnly, setPassportOnly] = useState(() => searchParams.get("passport") === "1")
  const [sortBy, setSortBy] = useState<SortOption>("closest")
  const [activeTab, setActiveTab] = useState<ExploreTab>("runs")
  const [runSortBy, setRunSortBy] = useState<RunSortOption>("time")
  const PAGE_SIZE = 10
  const [visibleCount, setVisibleCount] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("explore-visible")
      if (saved) return parseInt(saved, 10)
    }
    return PAGE_SIZE
  })
  const scrollRestoredRef = useRef(false)
  const skipVisibleResetRef = useRef(true)
  const [allWeekRuns, setAllWeekRuns] = useState<WeekRun[]>([])
  const [weekRunsLoading, setWeekRunsLoading] = useState(false)
  const [mapBounds, setMapBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null)
  const [cityCentroids, setCityCentroids] = useState<Record<string, { lat: number; lng: number }>>({})
  const [userSubscribedIds, setUserSubscribedIds] = useState<Set<string>>(new Set())
  // The mobile/desktop layouts below are both always in the DOM (only CSS-hidden via
  // Tailwind's md: classes), so without this we'd mount two live Mapbox GL maps at
  // once. Track the real viewport and only ever render one <MapView> at a time.
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  const [notInterestedIds, setNotInterestedIds] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try { return new Set(JSON.parse(localStorage.getItem("explore-not-interested") ?? "[]")) } catch { return new Set() }
    }
    return new Set()
  })

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUserId(data.user?.id || null)
      if (data.user) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single()
        setIsAdmin(profile?.role === "admin")
      }
      setAuthChecked(true)
    }
    getUser()
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUserId(session?.user?.id || null)
      if (session?.user) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single()
        setIsAdmin(profile?.role === "admin")
      } else {
        setIsAdmin(false)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const openDelete = (club: { id: string; name: string }) => {
    setDeleteTarget(club)
    setDeletePassword("")
    setDeleteError("")
  }
  const closeDelete = () => {
    setDeleteTarget(null)
    setDeletePassword("")
    setDeleteError("")
  }
  const handleDelete = async () => {
    if (!deleteTarget || !deletePassword) return
    setDeleting(true)
    setDeleteError("")
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/admin/delete-club", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ club_id: deleteTarget.id, password: deletePassword }),
    })
    if (res.ok) {
      setClubs((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      closeDelete()
    } else {
      const json = await res.json().catch(() => ({}))
      setDeleteError(json.error ?? "Failed to delete")
    }
    setDeleting(false)
  }

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
    async function loadData() {
      setWeekRunsLoading(true)
      const todayStr = localDateStr()
      const weekAhead = new Date()
      weekAhead.setDate(weekAhead.getDate() + 14)
      const weekStr = localDateStr(weekAhead)

      const clubsQuery = supabase.from("clubs").select("id, name, city, latitude, longitude, location, image_url, tier, membership_type, created_at, user_id, passport_program_enrolled, subscriptions(count)")

      const [{ data: clubData }, { data: runsData }, { data: citiesData }] = await Promise.all([
        isLocalDev ? clubsQuery.or(`is_public.eq.true,id.eq.${TEST_CLUB_ID}`) : clubsQuery.eq("is_public", true),
        supabase.from("runs").select("id, title, date, time, timezone, distance, meeting_point, city, run_lat, run_lng, tags, club_id").gte("date", todayStr).lte("date", weekStr).eq("is_public", true).order("date", { ascending: true }).order("time", { ascending: true }),
        supabase.from("cities").select("name, lat, lng"),
      ])

      const centroids: Record<string, { lat: number; lng: number }> = {}
      for (const c of citiesData || []) {
        if (c.lat != null && c.lng != null) centroids[c.name] = { lat: c.lat, lng: c.lng }
      }
      setCityCentroids(centroids)

      const loadedClubs = (clubData || []).map((club: any) => ({
        ...club,
        memberCount: club.subscriptions?.[0]?.count ?? 0,
        subscriptions: undefined,
      }))
      setClubs(loadedClubs)

      const clubLookup: Record<string, ClubWithExtras> = {}
      loadedClubs.forEach((c) => { clubLookup[c.id] = c })
      setAllWeekRuns(
        (runsData || []).map((r) => ({
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
    loadData()
  }, [])

  // Fetch only this user's subscriptions (small targeted query, not all subscriptions)
  useEffect(() => {
    if (!userId) { setUserSubscribedIds(new Set()); return }
    supabase.from("subscriptions").select("club_id").eq("user_id", userId)
      .then(({ data }) => setUserSubscribedIds(new Set(data?.map((s) => s.club_id) ?? [])))
  }, [userId])

  useEffect(() => {
    if (!selectedClub) return
    const el = document.getElementById(`club-${selectedClub.id}`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [selectedClub])

  useEffect(() => {
    if (skipVisibleResetRef.current) { skipVisibleResetRef.current = false; return }
    setVisibleCount(PAGE_SIZE)
  }, [city, cityCoords])

  // Persist visibleCount so the same number of cards exist in the DOM on return
  useEffect(() => {
    sessionStorage.setItem("explore-visible", String(visibleCount))
  }, [visibleCount])

  // Scroll the last-clicked club card into view after clubs load
  useEffect(() => {
    if (scrollRestoredRef.current || clubs.length === 0) return
    const clubId = sessionStorage.getItem("explore-last-club")
    if (!clubId) return
    scrollRestoredRef.current = true
    sessionStorage.removeItem("explore-last-club")
    sessionStorage.removeItem("explore-visible")
    requestAnimationFrame(() => {
      document.getElementById(`club-${clubId}`)?.scrollIntoView({ block: "center", behavior: "instant" })
    })
  }, [clubs])

  const center = cityCoords || userLocation
  const NEARBY_RADIUS = 50

  // Map each club_id to its earliest run this week (avoids N per-card queries)
  const nextRunByClubId = useMemo(() => {
    const map: Record<string, WeekRun> = {}
    allWeekRuns.forEach((run) => {
      if (!map[run.club_id]) map[run.club_id] = run
    })
    return map
  }, [allWeekRuns])

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

  const clubsWithDistance = useMemo(() => clubs.map((club) => {
    if (!center) return { ...club }
    let clubDist: number | undefined
    if (club.latitude != null && club.longitude != null) {
      clubDist = getDistanceMiles(center.lat, center.lng, club.latitude, club.longitude)
    }
    const runDist = nearestRunDistByClub[club.id]
    const dist = runDist != null && (clubDist == null || runDist < clubDist) ? runDist : clubDist
    return { ...club, distance: dist, nearestRunDist: runDist }
  }), [clubs, center, nearestRunDistByClub])

  const baseClubs = useMemo(() => center
    ? clubsWithDistance.filter((c) => c.distance == null || c.distance <= NEARBY_RADIUS)
    : clubsWithDistance, [center, clubsWithDistance])

  const filteredClubs = useMemo(() => baseClubs
    .filter((club) => {
      if (passportOnly && !club.passport_program_enrolled) return false
      if (club.distance != null) {
        const [dMin, dMax] = filters.distanceRange
        if (club.distance < dMin || (dMax < 25 && club.distance > dMax)) return false
      }
      if (filters.membershipType !== "all") {
        const mt = (club as any).membership_type as string | null
        if (filters.membershipType === "free" && mt !== "free") return false
        if (filters.membershipType === "paid" && mt !== "paid_required") return false
        if (filters.membershipType === "both" && mt !== "optional_paid") return false
      }
      return true
    })
    .sort((a, b) => {
      const aOwned = !!a.user_id
      const bOwned = !!b.user_id
      if (aOwned !== bOwned) return aOwned ? -1 : 1
      if (sortBy === "popular") return (b.memberCount ?? 0) - (a.memberCount ?? 0)
      if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (a.nearestRunDist != null && b.nearestRunDist != null) return a.nearestRunDist - b.nearestRunDist
      if (a.nearestRunDist != null) return -1
      if (b.nearestRunDist != null) return 1
      if (a.distance != null && b.distance != null) return a.distance - b.distance
      if (a.distance != null) return -1
      if (b.distance != null) return 1
      return 0
    }), [baseClubs, filters, sortBy, passportOnly])

  const activeFilterCount = [
    filters.distanceRange[0] > 0 || filters.distanceRange[1] < 25,
    filters.paceRange[0] > 5 || filters.paceRange[1] < 15,
    filters.membershipType !== "all",
  ].filter(Boolean).length

  const mapClubs = useMemo(
    () =>
      clubs
        .filter((c) => !passportOnly || c.passport_program_enrolled)
        .map((c) => {
          if (c.latitude != null && c.longitude != null) {
            return { id: c.id, name: c.name, lat: c.latitude, lng: c.longitude, image_url: c.image_url ?? null, tier: c.tier ?? null }
          }
          // No precise pin - fall back to the club's city centroid so it still shows up on the map
          const cityName = c.city?.split(",")[0]?.trim()
          const centroid = cityName ? cityCentroids[cityName] : undefined
          if (!centroid) return null
          return { id: c.id, name: c.name, lat: centroid.lat, lng: centroid.lng, image_url: c.image_url ?? null, tier: c.tier ?? null }
        })
        .filter((c) => c !== null),
    [clubs, cityCentroids, passportOnly]
  )

  const ownedClubIds = useMemo(
    () => new Set(clubs.filter((c) => c.user_id).map((c) => c.id)),
    [clubs]
  )

  const mapRuns = useMemo(() => mapBounds
    ? allWeekRuns.filter((r) => {
        const lat = r.run_lat ?? r.club_lat
        const lng = r.run_lng ?? r.club_lng
        if (lat == null || lng == null) return false
        return lat >= mapBounds.south && lat <= mapBounds.north && lng >= mapBounds.west && lng <= mapBounds.east
      })
    : allWeekRuns, [mapBounds, allWeekRuns])

  const nearbyClubIds = useMemo(() => new Set(baseClubs.map((c) => c.id)), [baseClubs])

  const weekRuns = useMemo(() => center
    ? allWeekRuns.filter((r) => {
        const lat = r.run_lat ?? r.club_lat
        const lng = r.run_lng ?? r.club_lng
        if (lat != null && lng != null) {
          return getDistanceMiles(center.lat, center.lng, lat, lng) <= 50
        }
        return nearbyClubIds.has(r.club_id)
      })
    : allWeekRuns, [center, allWeekRuns, nearbyClubIds])

  // weekRuns already arrives sorted by date, time (query order) - distance needs computing per-run
  const sortedWeekRuns = useMemo(() => {
    if (runSortBy !== "closest" || !center) return weekRuns
    return [...weekRuns].sort((a, b) => {
      const aLat = a.run_lat ?? a.club_lat, aLng = a.run_lng ?? a.club_lng
      const bLat = b.run_lat ?? b.club_lat, bLng = b.run_lng ?? b.club_lng
      const aDist = aLat != null && aLng != null ? getDistanceMiles(center.lat, center.lng, aLat, aLng) : null
      const bDist = bLat != null && bLng != null ? getDistanceMiles(center.lat, center.lng, bLat, bLng) : null
      if (aDist == null && bDist == null) return 0
      if (aDist == null) return 1
      if (bDist == null) return -1
      return aDist - bDist
    })
  }, [weekRuns, runSortBy, center])

  const groupedWeekRuns = useMemo(() => {
    const result: Record<string, WeekRun[]> = {}
    sortedWeekRuns.forEach((r) => {
      const label = formatDate(r.date)
      if (!result[label]) result[label] = []
      result[label].push(r)
    })
    return result
  }, [sortedWeekRuns])

  const locationLabel = cityCoords && city ? `near "${city}"` : "near you"

  const filterBar = (
    <div className="bg-[#1a2110] border-b border-[#2e3d1a]">
      <div className="px-5 py-3 flex items-center gap-3">
        <div className="flex-1">
          <SearchBar
            city={city}
            setCity={setCity}
            onSearch={() => {}}
            clubs={clubs}
            onSelectClub={(clubId) => router.push(`/clubs/${clubId}`)}
          />
        </div>
        <button
          onClick={() => setPassportOnly((v) => !v)}
          title="Show only klubs enrolled in the Passport payout program"
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-semibold transition shrink-0
            ${passportOnly
              ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]"
              : "text-white border-[#2e3d1a] hover:border-white/40"
            }`}
        >
          <Crown className="w-4 h-4" />
          <span className="hidden sm:inline">Passport</span>
        </button>
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

  const nearbyLabel = cityCoords && city ? `near "${city}"` : userLocation ? "near you" : null

  const tabSwitcher = (
    <div className="px-5 pt-4">
      <div className="relative inline-grid grid-cols-2 bg-[#1e2d12] border border-[#2e3d1a] rounded-full p-1">
        <div
          className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-[#c5f135] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            activeTab === "klubs" ? "translate-x-full" : "translate-x-0"
          }`}
        />
        {(["runs", "klubs"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative z-10 px-5 py-1.5 rounded-full text-sm font-bold capitalize transition-colors duration-300 ${
              activeTab === tab ? "text-[#1a2110]" : "text-white/50 hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  )

  const runsCountRow = (
    <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm text-white/50">
          <span className="font-bold text-white">{sortedWeekRuns.length}</span>{" "}
          {sortedWeekRuns.length === 1 ? "run" : "runs"}
          {nearbyLabel ? ` ${nearbyLabel}` : ""} in the next 2 weeks
        </p>
        {!center && (
          <p className="text-xs text-white/25 mt-0.5">Search a city or share your location to see runs near you</p>
        )}
      </div>
      <Select
        value={runSortBy}
        onChange={(e) => setRunSortBy(e.target.value as RunSortOption)}
        className="shrink-0 bg-[#1e2d12] border border-[#2e3d1a] text-white/80 text-sm font-semibold rounded-full pl-4 pr-3 py-2 focus:outline-none focus:border-[#c5f135]/50"
      >
        <option value="time">Day &amp; Time</option>
        <option value="closest" disabled={!center}>Closest</option>
      </Select>
    </div>
  )

  const countRow = (
    <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm text-white/50">
          <span className="font-bold text-white">{filteredClubs.length}</span>{" "}
          {filteredClubs.length === 1 ? "klub" : "klubs"}
          {nearbyLabel ? ` ${nearbyLabel}` : ""}
        </p>
        {!center && (
          <p className="text-xs text-white/25 mt-0.5">Search a city or share your location to see klubs near you</p>
        )}
      </div>
      <Select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as SortOption)}
        className="shrink-0 bg-[#1e2d12] border border-[#2e3d1a] text-white/80 text-sm font-semibold rounded-full pl-4 pr-3 py-2 focus:outline-none focus:border-[#c5f135]/50"
      >
        <option value="closest">Closest</option>
        <option value="popular">Most Popular</option>
        <option value="newest">Newest</option>
      </Select>
    </div>
  )

  const handleNotInterested = (id: string) => {
    setNotInterestedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      localStorage.setItem("explore-not-interested", JSON.stringify([...next]))
      return next
    })
  }

  const clearNotInterested = () => {
    setNotInterestedIds(new Set())
    localStorage.removeItem("explore-not-interested")
  }

  const listClubs = filteredClubs.filter((c) => !notInterestedIds.has(c.id))
  const remaining = listClubs.length - visibleCount

  const clubListSection = (
    <>
      <ClubList
        setHoveredClub={setHoveredClub}
        setSelectedClub={setSelectedClub}
        selectedClub={selectedClub}
        clubs={listClubs.slice(0, visibleCount)}
        setFavorites={setSubscriptions}
        userId={userId}
        requireAuth={requireAuth}
        onDelete={isAdmin ? openDelete : undefined}
        onNotInterested={handleNotInterested}
        userSubscribedIds={userSubscribedIds}
        nextRunByClubId={nextRunByClubId}
      />
      {remaining > 0 && (
        <div className="px-5 pb-5 pt-2">
          <button
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="w-full py-3 rounded-2xl border border-[#2e3d1a] bg-[#1e2d12] text-sm font-bold text-white/60 hover:text-white hover:border-[#c5f135]/40 transition"
          >
            Show {Math.min(PAGE_SIZE, remaining)} more klubs
          </button>
        </div>
      )}
      {notInterestedIds.size > 0 && (
        <div className="px-5 pb-4 text-center">
          <button onClick={clearNotInterested} className="text-xs text-white/25 hover:text-white/50 transition">
            {notInterestedIds.size} klub{notInterestedIds.size !== 1 ? "s" : ""} hidden - show again
          </button>
        </div>
      )}
    </>
  )

  function renderRunRow(run: WeekRun, showDate: boolean) {
    return (
      <div key={run.id} onClick={() => router.push(`/runs/${run.id}`)} className="px-4 py-3.5 flex items-start gap-3 cursor-pointer hover:bg-[#2e3d1a]/50 transition-colors">
        <div className="relative w-9 h-9 rounded-full bg-[#2e3d1a] shrink-0 overflow-hidden flex items-center justify-center">
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
            {showDate && (
              <span className="flex items-center gap-1 text-xs text-white/50">
                <CalendarCheck className="w-3 h-3" /> {formatDate(run.date)}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-white/50">
              <Clock className="w-3 h-3" /> {formatTime(run)}
            </span>
            {run.meeting_point && (
              <span className="flex items-center gap-1 text-xs text-white/50">
                <MapPin className="w-3 h-3" /> {run.meeting_point}
              </span>
            )}
            {run.distance && <span className="text-xs text-white/40">{run.distance}</span>}
          </div>
          {run.tags && run.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {run.tags.map((tag) => (
                <span key={tag} className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${getTagStyle(tag)}`}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const runsListSection = (
    <div className="px-6 pb-8">
      {center && (
        <p className="text-[11px] text-white/30 font-medium mb-3">within 50 mi {locationLabel}</p>
      )}
      {weekRunsLoading && (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
        </div>
      )}
      {!weekRunsLoading && sortedWeekRuns.length === 0 && (
        <div className="bg-[#1e2d12] rounded-2xl p-6 text-center">
          <CalendarCheck className="w-8 h-8 text-white/20 mx-auto mb-2" />
          <p className="text-white/40 text-sm">
            {center ? "No runs scheduled nearby in the next 2 weeks." : "No runs scheduled in the next 2 weeks."}
          </p>
          {!center && (
            <p className="text-white/25 text-xs mt-1">Search a city or enable location to filter by distance.</p>
          )}
        </div>
      )}
      {!weekRunsLoading && sortedWeekRuns.length > 0 && runSortBy === "time" && (
        <div className="space-y-5">
          {Object.entries(groupedWeekRuns).map(([dateLabel, dayRuns]) => (
            <div key={dateLabel}>
              <p className="text-[11px] font-bold text-[#c5f135]/70 tracking-widest uppercase mb-2 px-1">{dateLabel}</p>
              <div className="bg-[#1e2d12] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">
                {dayRuns.map((run) => renderRunRow(run, false))}
              </div>
            </div>
          ))}
        </div>
      )}
      {!weekRunsLoading && sortedWeekRuns.length > 0 && runSortBy === "closest" && (
        <div className="bg-[#1e2d12] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">
          {sortedWeekRuns.map((run) => renderRunRow(run, true))}
        </div>
      )}
    </div>
  )

  if (!authChecked) {
    return (
      <div className="flex justify-center py-24 bg-[#1a2110] min-h-screen">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  const gated = authChecked && !userId
  const gatedClass = gated ? "blur-sm pointer-events-none select-none" : ""

  return (
    <>
      {/* ── MOBILE ── */}
      <div className="md:hidden bg-[#1a2110]">
        <div className="sticky z-40" style={{ top: 'var(--navbar-h)' }}>{filterBar}</div>
        {/* Map always visible at top, stacked above list */}
        <div className={`h-[220px] transition-[filter] ${gatedClass}`}>
          {isDesktop === false && (
            <MapView city={city} runs={mapRuns} clubs={mapClubs} ownedClubIds={ownedClubIds} onCityCoords={setCityCoords} onBoundsChange={setMapBounds} hideControls />
          )}
        </div>
        {tabSwitcher}
        {activeTab === "runs" ? (
          <>
            {runsCountRow}
            <div className={`transition-[filter] ${gatedClass}`}>{runsListSection}</div>
          </>
        ) : (
          <>
            {countRow}
            <div className={`transition-[filter] ${gatedClass}`}>{clubListSection}</div>
          </>
        )}
        <div className="h-24" />
      </div>

      {/* ── DESKTOP ── */}
      <div className="hidden md:block bg-[#1a2110]">
        <div className="sticky z-40" style={{ top: 'var(--navbar-h)' }}>{filterBar}</div>
        <div className="flex">
          <div className="w-[58%] border-r border-[#2e3d1a]" style={{ minHeight: 'calc(100vh - var(--navbar-h))' }}>
            {tabSwitcher}
            {activeTab === "runs" ? (
              <>
                {runsCountRow}
                <div className={`transition-[filter] ${gatedClass}`}>{runsListSection}</div>
              </>
            ) : (
              <>
                {countRow}
                <div className={`transition-[filter] ${gatedClass}`}>{clubListSection}</div>
              </>
            )}
            <div className="h-8" />
          </div>
          <div className="w-[42%] shrink-0">
            <div
              className={`sticky transition-[filter] ${gatedClass}`}
              style={{ top: 'var(--navbar-h)', height: 'calc(100vh - var(--navbar-h))', transform: 'translateZ(0)', willChange: 'transform' }}
            >
              {isDesktop === true && (
                <MapView city={city} runs={mapRuns} clubs={mapClubs} ownedClubIds={ownedClubIds} onCityCoords={setCityCoords} onBoundsChange={setMapBounds} />
              )}
            </div>
          </div>
        </div>
        <div className="h-6" />
      </div>

      {gated && (
        <div className="fixed inset-x-0 z-40 flex justify-center px-5 pointer-events-none" style={{ top: 'calc(var(--navbar-h) + 24px)' }}>
          <div className="max-w-sm w-full bg-[#1e2d12] border border-[#c5f135]/25 rounded-2xl p-6 text-center shadow-2xl shadow-black/60 pointer-events-auto">
            <div className="w-11 h-11 rounded-full bg-[#c5f135]/10 border border-[#c5f135]/25 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-5 h-5 text-[#c5f135]" />
            </div>
            <p className="text-white font-black text-base">Sign up to see klubs near you</p>
            <p className="text-white/40 text-xs mt-1.5 leading-relaxed">
              Create a free account to unlock the map and browse klubs.
            </p>
            <button
              onClick={() => setShowAuthModal(true)}
              className="mt-4 w-full px-6 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition"
            >
              Sign Up - It&apos;s Free
            </button>
          </div>
        </div>
      )}

      {showAuthModal && (
        <LoginModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => {
            setShowAuthModal(false)
            if (pendingAction) { pendingAction(); setPendingAction(null) }
          }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeDelete} />
          <div className="relative bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-6 w-full max-w-sm max-h-[85vh] overflow-y-auto space-y-4">
            <div>
              <p className="text-xs font-bold text-red-400/70 uppercase tracking-widest mb-1">Delete Klub</p>
              <p className="text-lg font-black text-white">{deleteTarget.name}</p>
              <p className="text-xs text-white/40 mt-1">This permanently deletes the klub and all its runs. This cannot be undone.</p>
            </div>
            <div>
              <label className="text-xs text-white/50 font-semibold mb-1.5 block">Enter your password to confirm</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleDelete()}
                placeholder="Your password"
                autoFocus
                className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-red-400/50 transition"
              />
              {deleteError && <p className="text-red-400 text-xs mt-2">{deleteError}</p>}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={closeDelete}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-[#2e3d1a] text-white/50 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || !deletePassword}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-black bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-40 transition"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
