"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Stamp, Flame, MapPin, Users2, CalendarCheck, ChevronLeft, ChevronRight, Home, Plane, Trophy, Lock, Share2, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  getPassportData,
  getUserPassportProgress,
  getPassportBook,
  getCityLeaderboard,
  computeCheckinStreak,
  getUserTierProgress,
  getUserStatesProgress,
  type CityProgress,
  type BookPage,
  type BookStampSlot,
  type TierProgress,
  type StateProgress,
} from "@/lib/checkins"
import Leaderboard from "@/components/Leaderboard"
import TierCard from "@/components/TierCard"
import LoginModal from "@/components/LoginModal"

type PreviewCity = { id: string; name: string; state: string | null; flag_asset_url: string | null }

const BADGE_ROW_LIMIT = 5 // grid-cols-4 → 5 rows = 20 badges max before truncating

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

function StatesRow({ states }: { states: StateProgress[] }) {
  if (states.length === 0) return null
  return (
    <div className="mb-6">
      <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3">
        States ({states.filter((s) => s.visited).length}/{states.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {states.map((s) => (
          <span
            key={s.state}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
              s.visited
                ? "bg-[#c5f135]/10 border border-[#c5f135]/40 text-[#c5f135]"
                : "border border-dashed border-white/15 text-white/25"
            }`}
          >
            {s.state}
          </span>
        ))}
      </div>
    </div>
  )
}

function StampSlot({
  slot,
  isNew,
  onOpenActions,
}: {
  slot: BookPage["slots"][number]
  isNew: boolean
  onOpenActions: (slot: BookStampSlot) => void
}) {
  const gradient = getGradient(slot.club_name)

  const badge = (
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
  )

  const label = (
    <p className={`text-[10px] leading-tight line-clamp-2 ${slot.stamped ? "text-white/80 font-semibold group-hover:text-[#c5f135]" : "text-white/25"}`}>
      {slot.club_name}
    </p>
  )

  if (!slot.stamped) {
    return (
      <Link href={`/clubs/${slot.club_id}`} className="flex flex-col items-center gap-1.5 text-center group">
        {badge}
        {label}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onOpenActions(slot)}
      className="flex flex-col items-center gap-1.5 text-center group"
    >
      {badge}
      {label}
    </button>
  )
}

function StampActionSheet({
  slot,
  page,
  sharing,
  onShare,
  onViewKlub,
  onClose,
}: {
  slot: BookStampSlot
  page: BookPage
  sharing: boolean
  onShare: () => void
  onViewKlub: () => void
  onClose: () => void
}) {
  const gradient = getGradient(slot.club_name)
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm h-[calc(100vh_-_var(--navbar-h)_-_1cm)] sm:h-auto flex flex-col bg-[#1e2d12] border border-[#2e3d1a] rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5 animate-[fadeUp_0.25s_ease-out_forwards]"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-12 h-12 rounded-full overflow-hidden flex items-center justify-center border-2 border-[#3d5220] bg-gradient-to-br ${gradient} shrink-0`}>
            {slot.club_image_url ? (
              <img src={slot.club_image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-black text-white/80">{clubAbbr(slot.club_name)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white leading-tight truncate">{slot.club_name}</p>
            <p className="text-xs text-white/40">
              {page.city_name}{page.city_state ? `, ${page.city_state}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition p-1 shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center">
          <div className={`w-28 h-28 rounded-full overflow-hidden flex items-center justify-center border-2 border-[#3d5220] bg-gradient-to-br ${gradient} shadow-lg shadow-black/30`}>
            {slot.club_image_url ? (
              <img src={slot.club_image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-black text-white/80">{clubAbbr(slot.club_name)}</span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={onShare}
            disabled={sharing}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#c5f135] text-[#1a2110] text-sm font-black hover:bg-[#d4ff45] transition disabled:opacity-50"
          >
            <Share2 className="w-4 h-4" />
            {sharing ? "Sharing…" : "Share Stamp"}
          </button>
          <button
            onClick={onViewKlub}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#1a2110] border border-[#2e3d1a] text-white text-sm font-bold hover:border-white/20 transition"
          >
            <Users2 className="w-4 h-4 text-white/50" />
            View Klub
          </button>
        </div>
      </div>
    </div>
  )
}

function PassportBookPage({
  page,
  justUnlocked,
  userId,
  onOpenStampActions,
}: {
  page: BookPage
  justUnlocked: JustUnlocked
  userId: string | null
  onOpenStampActions: (slot: BookStampSlot, page: BookPage) => void
}) {
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
          {page.slots.slice(0, BADGE_ROW_LIMIT * 4).map((slot) => (
            <StampSlot
              key={slot.club_id}
              slot={slot}
              isNew={justUnlocked.clubIds.includes(slot.club_id)}
              onOpenActions={(s) => onOpenStampActions(s, page)}
            />
          ))}
        </div>
        {page.slots.length > BADGE_ROW_LIMIT * 4 && (
          <p className="text-center text-xs text-white/30 font-semibold mt-4">
            +{page.slots.length - BADGE_ROW_LIMIT * 4} more
          </p>
        )}
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
  const [tierProgress, setTierProgress] = useState<TierProgress | null>(null)
  const [states, setStates] = useState<StateProgress[]>([])
  const [sharing, setSharing] = useState(false)
  const [sharingStamp, setSharingStamp] = useState(false)
  const [actionSheet, setActionSheet] = useState<{ slot: BookStampSlot; page: BookPage } | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Guest-facing teaser data: real, public (no RLS gate), used to show a
  // blurred preview of the Passport instead of an empty state.
  const [previewCities, setPreviewCities] = useState<PreviewCity[]>([])
  const [totalCityCount, setTotalCityCount] = useState(0)
  const [totalClubCount, setTotalClubCount] = useState(0)
  const [showAuthModal, setShowAuthModal] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Passport is member-only — directors manage klubs from their Director dashboard
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
        if (profile?.role === "manager") { router.replace("/"); return }
      }
      setUserId(user?.id ?? null)
      if (user) {
        const [passportData, progressData, bookData, tierData, statesData] = await Promise.all([
          getPassportData(),
          getUserPassportProgress(),
          getPassportBook(),
          getUserTierProgress(),
          getUserStatesProgress(),
        ])
        setCheckinDates(passportData.checkinDates)
        setTotalCheckins(passportData.totalCheckins)
        setClubStampCount(passportData.clubCheckIns.length)
        setProgress(progressData)
        setBook(bookData)
        setTierProgress(tierData)
        setStates(statesData)

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

    // Public preview data, fetched regardless of auth — powers the blurred
    // teaser for signed-out visitors.
    async function loadPreview() {
      const [{ data: cities, count: cityCount }, { count: clubCount }] = await Promise.all([
        supabase.from("cities").select("id, name, state, flag_asset_url", { count: "exact" }).order("population", { ascending: false }).limit(12),
        supabase.from("clubs").select("id", { count: "exact", head: true }).eq("is_public", true),
      ])
      setPreviewCities((cities as PreviewCity[]) || [])
      setTotalCityCount(cityCount ?? 0)
      setTotalClubCount(clubCount ?? 0)
    }
    loadPreview()
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

  const handleShareTier = async () => {
    if (!tierProgress?.current_tier_slug) return
    setSharing(true)
    try {
      const params = new URLSearchParams({
        type: "tier",
        tierSlug: tierProgress.current_tier_slug,
        tierName: tierProgress.current_tier ?? "Local",
        citiesCount: String(tierProgress.cities_total),
        statesCount: String(tierProgress.states_total),
      })
      const url = `/api/passport/share-card?${params.toString()}`
      const res = await fetch(url)
      const blob = await res.blob()
      const file = new File([blob], "runklub-tier.png", { type: "image/png" })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "RunKlub" })
      } else {
        window.open(url, "_blank")
      }
    } catch { /* sharing failed — non-critical, user can retry */ }
    setSharing(false)
  }

  const handleShareStamp = async (slot: BookStampSlot, page: BookPage) => {
    setSharingStamp(true)
    try {
      const params = new URLSearchParams({
        clubName: slot.club_name,
        cityName: page.city_name,
        cityState: page.city_state ?? "",
        stampNumber: String(slot.checkin_count),
        totalCount: String(page.total_count),
      })
      if (slot.club_image_url) params.set("stampUrl", slot.club_image_url)
      const url = `/api/passport/share-card?${params.toString()}`
      const res = await fetch(url)
      const blob = await res.blob()
      const file = new File([blob], "runklub-stamp.png", { type: "image/png" })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "RunKlub" })
      } else {
        window.open(url, "_blank")
      }
    } catch { /* sharing failed — non-critical, user can retry */ }
    setSharingStamp(false)
  }

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-[#c5f135]/10 border border-[#c5f135]/25 flex items-center justify-center shrink-0">
            <Stamp className="w-4 h-4 text-[#c5f135]" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-white leading-tight">Passport</h1>
            <p className="text-xs text-white/40 mt-0.5">
              {userId
                ? `${book.length} of ${progress.length} cities · ${clubStampCount} klub${clubStampCount === 1 ? "" : "s"} stamped`
                : `${totalCityCount} cities · ${totalClubCount} klubs to stamp`}
            </p>
          </div>
          <Link
            href="/challenges"
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-white/60 text-xs font-bold hover:bg-white/10 hover:text-white transition"
          >
            <Flame className="w-3.5 h-3.5" /> Missions
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
          </div>
        ) : !userId ? (
          <div className="relative">
            <div className="blur-sm pointer-events-none select-none grid grid-cols-4 gap-3">
              {previewCities.map((c) => (
                <div key={c.id} className="flex flex-col items-center gap-1.5">
                  <div className="w-14 h-14 rounded-full border-2 border-dashed border-[#3d5220] bg-[#0e150a] flex items-center justify-center overflow-hidden">
                    {c.flag_asset_url ? (
                      <img src={c.flag_asset_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Stamp className="w-5 h-5 text-white/20" />
                    )}
                  </div>
                  <p className="text-[10px] text-white/40 font-semibold text-center truncate w-full">{c.name}</p>
                </div>
              ))}
            </div>

            <div className="absolute inset-0 flex items-center justify-center px-5">
              <div className="max-w-xs w-full bg-[#1e2d12] border border-[#c5f135]/25 rounded-2xl p-6 text-center shadow-2xl shadow-black/60">
                <div className="w-11 h-11 rounded-full bg-[#c5f135]/10 border border-[#c5f135]/25 flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-5 h-5 text-[#c5f135]" />
                </div>
                <p className="text-white font-black text-base">Sign up to start your Passport</p>
                <p className="text-white/40 text-xs mt-1.5 leading-relaxed">
                  Check in at klubs to collect stamps from every city you visit.
                </p>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="mt-4 w-full px-6 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition"
                >
                  Sign Up — It&apos;s Free
                </button>
              </div>
            </div>

            {showAuthModal && (
              <LoginModal onClose={() => setShowAuthModal(false)} onSuccess={() => setShowAuthModal(false)} />
            )}
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
            {tierProgress && (
              <TierCard progress={tierProgress} onShare={sharing ? undefined : handleShareTier} />
            )}

            <div className="grid grid-cols-2 gap-3 mb-6">
              <GoalBox label="Home City" city={homeCity} emptyHint="Check in at your home klub to set this goal." />
              <GoalBox label="Next City" city={nextCity} emptyHint="Discover a new city to chase next." />
            </div>

            <CompletedCitiesRow cities={completedCities} onJump={jumpToCity} />
            <StatesRow states={states} />

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
                    <PassportBookPage
                      key={page.city_id}
                      page={page}
                      justUnlocked={justUnlocked}
                      userId={userId}
                      onOpenStampActions={(slot, p) => setActionSheet({ slot, page: p })}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {actionSheet && (
        <StampActionSheet
          slot={actionSheet.slot}
          page={actionSheet.page}
          sharing={sharingStamp}
          onShare={async () => {
            const { slot, page } = actionSheet
            setActionSheet(null)
            await handleShareStamp(slot, page)
          }}
          onViewKlub={() => {
            const clubId = actionSheet.slot.club_id
            setActionSheet(null)
            router.push(`/clubs/${clubId}`)
          }}
          onClose={() => setActionSheet(null)}
        />
      )}
    </div>
  )
}
