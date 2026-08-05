"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Clock, MapPin, MessageSquare, CheckCircle2, ExternalLink } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { getDistanceMiles } from "@/utils/distance"
import { localDateStr } from "@/utils/dates"
import { getTagStyle } from "@/utils/tagStyle"
import { isVerifiedClub } from "@/utils/clubTier"
import { getClubStampArt, getUserPassportProgress } from "@/lib/checkins"
import RunChatPanel from "@/components/RunChatPanel"
import CheckInMoment, { type CheckInMomentProps } from "@/components/CheckInMoment"
import BadgeUnlockModal, { type UnlockedBadge } from "@/components/BadgeUnlockModal"
import ChallengeCompleteMoment, { type NewlyCompletedChallenge } from "@/components/ChallengeCompleteMoment"
import BuddyPicker from "@/components/BuddyPicker"

const CHECKIN_RADIUS_MILES = 0.3
const METRO_CHECKIN_RADIUS_MILES = 25

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Geolocation not supported")); return }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
  })
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

type MomentData = Omit<CheckInMomentProps, "onDone">

export type Run = {
  id: string
  club_id: string
  title: string
  date: string
  time: string
  distance: string | null
  meeting_point: string | null
  city: string | null
  external_url: string | null
  description: string | null
  tags: string[] | null
  is_in_person: boolean
  members_only: boolean
  run_lat: number | null
  run_lng: number | null
}

export type Club = {
  id: string
  name: string
  image_url: string | null
  latitude: number | null
  longitude: number | null
  city: string | null
  tier: string | null
}

export default function RunPageClient({ runId }: { runId: string }) {
  const router = useRouter()
  const [run, setRun] = useState<Run | null>(null)
  const [club, setClub] = useState<Club | null>(null)
  const [cityFallback, setCityFallback] = useState<{ lat: number; lng: number } | null>(null)
  const [loadingRun, setLoadingRun] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [checkedIn, setCheckedIn] = useState(false)
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkInError, setCheckInError] = useState<string | null>(null)
  const [checkInMoment, setCheckInMoment] = useState<MomentData | null>(null)
  const [pendingBadges, setPendingBadges] = useState<UnlockedBadge[]>([])
  const [newlyCompleted, setNewlyCompleted] = useState<NewlyCompletedChallenge[]>([])
  const [checkInId, setCheckInId] = useState<string | null>(null)
  const [showBuddyPicker, setShowBuddyPicker] = useState(false)
  const [showChat, setShowChat] = useState(false)

  // Fetched client-side (not server-side with the anon key) so RLS evaluates
  // as the actual signed-in visitor — otherwise an approved member clicking
  // a shared link to their own private run would incorrectly see "not found."
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("runs")
        .select(
          "id, club_id, title, date, time, distance, meeting_point, city, external_url, description, tags, is_in_person, members_only, run_lat, run_lng, clubs(id, name, image_url, latitude, longitude, city, tier)"
        )
        .eq("id", runId)
        .maybeSingle()

      if (error || !data || !data.clubs) { setLoadingRun(false); return }

      const clubData = data.clubs as unknown as Club
      setRun({
        id: data.id,
        club_id: data.club_id,
        title: data.title,
        date: data.date,
        time: data.time,
        distance: data.distance,
        meeting_point: data.meeting_point,
        city: data.city,
        external_url: data.external_url,
        description: data.description,
        tags: data.tags,
        is_in_person: data.is_in_person,
        members_only: data.members_only,
        run_lat: data.run_lat,
        run_lng: data.run_lng,
      })
      setClub(clubData)

      // Klubs without a precise pin fall back to their city's centroid for check-in
      if (data.run_lat == null && (clubData.latitude == null || clubData.longitude == null) && clubData.city) {
        const cityName = clubData.city.split(",")[0].trim()
        const { data: cityRow } = await supabase
          .from("cities")
          .select("lat, lng")
          .eq("name", cityName)
          .maybeSingle()
        if (cityRow?.lat != null && cityRow?.lng != null) {
          setCityFallback({ lat: cityRow.lat, lng: cityRow.lng })
        }
      }

      setLoadingRun(false)
    }
    load()
  }, [runId])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null)
      setSessionToken(session?.access_token ?? null)
    })
  }, [])

  useEffect(() => {
    if (!userId || !run) return
    supabase
      .from("run_checkins")
      .select("id")
      .eq("run_id", run.id)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setCheckedIn(!!data))
  }, [userId, run])

  if (loadingRun) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  if (!run || !club) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex flex-col items-center justify-center gap-3">
        <p className="text-white/40 text-sm">Run not found.</p>
        <Link href="/explore" className="text-[#c5f135] text-sm font-semibold hover:underline">
          ← Discover klubs
        </Link>
      </div>
    )
  }

  const todayStr = localDateStr()
  const isToday = run.date === todayStr
  const canCheckIn = isToday && run.is_in_person

  const handleCheckIn = async () => {
    if (!userId || !sessionToken) { router.push("/login"); return }

    // Geofencing only applies to verified (paid-tier) klubs — their location
    // data is confirmed accurate. Free/unclaimed klubs often have approximate
    // or missing coordinates, so requiring proximity there would unfairly
    // block real check-ins over a data-quality problem, not a fraud one.
    if (isVerifiedClub(club.tier)) {
      const checkinTarget =
        run.run_lat != null && run.run_lng != null
          ? { lat: run.run_lat, lng: run.run_lng, radiusMiles: CHECKIN_RADIUS_MILES }
          : club.latitude != null && club.longitude != null
            ? { lat: club.latitude, lng: club.longitude, radiusMiles: CHECKIN_RADIUS_MILES }
            : cityFallback
              ? { lat: cityFallback.lat, lng: cityFallback.lng, radiusMiles: METRO_CHECKIN_RADIUS_MILES }
              : null

      if (!checkinTarget) {
        setCheckInError("This run hasn't set a location yet, so check-in isn't available.")
        return
      }

      setCheckingIn(true)
      setCheckInError(null)

      try {
        const pos = await getCurrentPosition()
        const distance = getDistanceMiles(pos.coords.latitude, pos.coords.longitude, checkinTarget.lat, checkinTarget.lng)
        if (distance > checkinTarget.radiusMiles) {
          setCheckInError("You need to be at the run to check in.")
          setCheckingIn(false)
          return
        }
      } catch {
        setCheckInError("Enable location access to check in.")
        setCheckingIn(false)
        return
      }
    } else {
      setCheckingIn(true)
      setCheckInError(null)
    }

    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ run_id: run.id }),
    })
    const data = await res.json()
    setCheckingIn(false)

    if (!res.ok) {
      setCheckInError("Check-in failed. Try again.")
      return
    }

    setCheckedIn(true)

    // Independent of the passport rollup below — always set so the buddy
    // picker and challenge-completion celebration still fire even if that
    // best-effort call failed.
    if (data.checkInId) {
      setCheckInId(data.checkInId)
      setShowBuddyPicker(true)
    }
    if (data.newlyCompletedChallenges?.length) setNewlyCompleted(data.newlyCompletedChallenges)

    const passport = data.passport
    if (!passport) return

    if (passport.new_badges?.length) setPendingBadges(passport.new_badges)

    if (passport.club_first || passport.city_first) {
      try {
        const raw = sessionStorage.getItem("runklub_just_unlocked")
        const unlocked = raw ? JSON.parse(raw) : { clubIds: [], cityIds: [] }
        if (passport.club_first) unlocked.clubIds.push(run.club_id)
        if (passport.city_first && passport.city_id) unlocked.cityIds.push(passport.city_id)
        sessionStorage.setItem("runklub_just_unlocked", JSON.stringify(unlocked))
      } catch { /* sessionStorage unavailable — unlock animation is a nice-to-have */ }
    }

    const [stampUrl, progress] = await Promise.all([
      getClubStampArt(run.club_id),
      getUserPassportProgress(),
    ])
    const justStampedCity = passport.city_id ? progress.find((c) => c.city_id === passport.city_id) ?? null : null
    const nearest = progress.find((c) => c.is_nearest_incomplete) ?? null
    const totalStamps = progress.reduce((sum, c) => sum + c.stamped_clubs, 0)
    const justStampedCityComplete = !!justStampedCity?.is_complete && passport.city_first
    const isMilestone = totalStamps > 0 && totalStamps % 5 === 0

    let shareCardUrl: string | null = null
    if (passport.club_first && (justStampedCityComplete || isMilestone)) {
      const params = new URLSearchParams({
        type: justStampedCityComplete ? "complete" : "milestone",
        clubName: club.name,
        cityName: justStampedCity?.city_name ?? "",
        cityState: justStampedCity?.city_state ?? "",
        stampNumber: String(totalStamps),
        totalCount: String(justStampedCity?.total_clubs ?? 0),
      })
      if (stampUrl) params.set("stampUrl", stampUrl)
      shareCardUrl = `/api/passport/share-card?${params.toString()}`
    }

    setCheckInMoment({
      clubName: club.name,
      clubStampUrl: stampUrl,
      isFirstTime: passport.club_first,
      clubCount: passport.club_count,
      totalStamps,
      justStampedCityComplete,
      justStampedCityName: justStampedCity?.city_name ?? null,
      nearestIncomplete: nearest ? { cityName: nearest.city_name, remaining: nearest.remaining } : null,
      shareCardUrl,
    })
  }

  return (
    <div className="min-h-screen bg-[#1a2110]">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <Link
          href={`/clubs/${club.id}`}
          className="inline-flex items-center gap-1.5 text-white/40 hover:text-white text-sm font-semibold mb-6 transition"
        >
          <ArrowLeft className="w-4 h-4" /> {club.name}
        </Link>

        <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5 mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-[#2e3d1a]">
              {club.image_url ? (
                <img src={club.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-black text-[#c5f135]">{initialsOf(club.name)}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-black text-white leading-tight">{run.title}</p>
              <p className="text-xs text-white/40 mt-0.5">{club.name}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-white/60 mb-3">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#c5f135]" />
              {new Date(run.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at {formatTime(run.time)}
            </span>
            {run.distance && <span>{run.distance}</span>}
            {run.members_only && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 border border-white/10">
                MEMBERS
              </span>
            )}
          </div>

          {run.meeting_point ? (
            <p className="flex items-center gap-1.5 text-sm text-white/50 mb-3">
              <MapPin className="w-3.5 h-3.5 text-[#c5f135] shrink-0" /> {run.meeting_point}
            </p>
          ) : run.city && (
            <p className="flex items-center gap-1.5 text-sm text-white/50 mb-3">
              <MapPin className="w-3.5 h-3.5 text-[#c5f135] shrink-0" /> {run.city}
            </p>
          )}

          {run.description && (
            <p className="text-sm text-white/60 leading-relaxed mb-4">{run.description}</p>
          )}

          {run.tags && run.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {run.tags.map((tag) => (
                <span key={tag} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getTagStyle(tag)}`}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {run.external_url && (
            <a
              href={run.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black bg-[#1a2110] border border-[#c5f135]/30 text-[#c5f135] hover:border-[#c5f135]/60 transition mb-2"
            >
              <ExternalLink className="w-4 h-4" /> RSVP / Manage this run
            </a>
          )}

          {canCheckIn && (
            <button
              onClick={() => !checkedIn && handleCheckIn()}
              disabled={checkingIn}
              className={`w-full py-3 rounded-2xl text-sm font-black transition flex items-center justify-center gap-2 ${
                checkedIn
                  ? "bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30 cursor-default"
                  : "bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] active:scale-95 disabled:opacity-40"
              }`}
            >
              {checkedIn ? (
                <><CheckCircle2 className="w-4 h-4" /> Checked In</>
              ) : checkingIn ? (
                "Checking in…"
              ) : (
                "Check In"
              )}
            </button>
          )}
          {checkInError && <p className="text-xs text-red-400/80 leading-relaxed mt-2">{checkInError}</p>}
        </div>

        {userId ? (
          <button
            onClick={() => setShowChat(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#1e2d12] border border-[#2e3d1a] hover:border-[#c5f135]/30 transition text-left"
          >
            <div className="w-9 h-9 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-[#c5f135]" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Messages</p>
              <p className="text-xs text-white/40 mt-0.5">Group chat, or message a member privately</p>
            </div>
          </button>
        ) : (
          <button
            onClick={() => router.push("/login")}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#1e2d12] border border-[#2e3d1a] hover:border-[#c5f135]/30 transition text-left"
          >
            <div className="w-9 h-9 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-white/30" />
            </div>
            <p className="text-sm font-bold text-white/60">Sign in to check in and chat</p>
          </button>
        )}
      </div>

      {showChat && userId && (
        <RunChatPanel
          target={{
            type: "run",
            id: run.id,
            title: run.title,
            date: run.date,
            time: run.time,
            distance: run.distance,
            meeting_point: run.meeting_point,
            clubName: club.name,
            clubImageUrl: club.image_url,
          }}
          userId={userId}
          onClose={() => setShowChat(false)}
        />
      )}

      {checkInMoment && <CheckInMoment {...checkInMoment} onDone={() => setCheckInMoment(null)} />}
      {!checkInMoment && pendingBadges.length > 0 && (
        <BadgeUnlockModal badges={pendingBadges} onDone={() => setPendingBadges([])} />
      )}
      {!checkInMoment && pendingBadges.length === 0 && newlyCompleted.length > 0 && (
        <ChallengeCompleteMoment challenges={newlyCompleted} onDone={() => setNewlyCompleted([])} />
      )}
      {!checkInMoment && pendingBadges.length === 0 && newlyCompleted.length === 0 && showBuddyPicker && userId && checkInId && (
        <BuddyPicker
          runId={run.id}
          checkInId={checkInId}
          userId={userId}
          onDone={() => setShowBuddyPicker(false)}
        />
      )}
    </div>
  )
}
