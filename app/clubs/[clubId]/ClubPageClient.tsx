"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Heart, MapPin, Clock, Users, ArrowLeft, Zap, ShieldCheck, ExternalLink, MessageSquare, Stamp } from "lucide-react"
import { getTagStyle } from "@/utils/tagStyle"
import { localDateStr } from "@/utils/dates"
import { getDistanceMiles } from "@/utils/distance"
import { checkInToClub, getClubLeaderboard, getClubStampArt, getUserPassportProgress } from "@/lib/checkins"
import RunChatPanel from "@/components/RunChatPanel"
import CheckInMoment, { type CheckInMomentProps } from "@/components/CheckInMoment"
import Leaderboard from "@/components/Leaderboard"
import { track } from "@vercel/analytics"

type MomentData = Omit<CheckInMomentProps, "onDone">

const CHECKIN_RADIUS_MILES = 0.3
// Klubs without a precise pin fall back to their city's centroid — much
// looser tolerance since a centroid can be miles from the actual meeting spot.
const METRO_CHECKIN_RADIUS_MILES = 25

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Geolocation not supported")); return }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
  })
}

export type Club = {
  id: string
  name: string
  city: string | null
  location: string | null
  description: string | null
  instagram_handle: string | null
  image_url: string | null
  tier: string | null
  is_public: boolean
  membership_type?: "free" | "optional_paid" | "paid_required" | null
  website?: string | null
  latitude?: number | null
  longitude?: number | null
}

export type Run = {
  id: string
  title: string
  date: string
  time: string
  distance: string | null
  meeting_point: string | null
  tags: string[] | null
  members_only?: boolean
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

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

export default function ClubPageClient({
  club,
  runs,
  memberCount: initialMemberCount,
  isClaimed,
  cityFallback,
}: {
  club: Club
  runs: Run[]
  memberCount: number
  isClaimed: boolean
  cityFallback: { lat: number; lng: number } | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [memberCount, setMemberCount] = useState(initialMemberCount)
  const [subscribing, setSubscribing] = useState(false)
  const [showClaimForm, setShowClaimForm] = useState(false)
  const [claimInstagram, setClaimInstagram] = useState("")
  const [claimMessage, setClaimMessage] = useState("")
  const [claimSubmitting, setClaimSubmitting] = useState(false)
  const [claimStatus, setClaimStatus] = useState<"idle" | "pending" | "submitted">("idle")
  const [joinRequestStatus, setJoinRequestStatus] = useState<"none" | "pending" | "approved" | "rejected">("none")
  const [requestingJoin, setRequestingJoin] = useState(false)
  const [joinBanner, setJoinBanner] = useState(false)
  const [activeChatRun, setActiveChatRun] = useState<Run | null>(null)
  const [chattableRunIds, setChattableRunIds] = useState<Set<string>>(new Set())
  const [isPaidMember, setIsPaidMember] = useState(false)
  const [memberOnlyRuns, setMemberOnlyRuns] = useState<Run[]>([])
  const [checkingIn, setCheckingIn] = useState(false)
  const [justCheckedIn, setJustCheckedIn] = useState(false)
  const [checkInMoment, setCheckInMoment] = useState<MomentData | null>(null)
  const [checkInError, setCheckInError] = useState<string | null>(null)

  // Refs for section-visibility tracking
  const runsRef = useRef<HTMLDivElement>(null)
  const descRef = useRef<HTMLParagraphElement>(null)
  const leaderboardRef = useRef<HTMLDivElement>(null)

  // Track page view on mount
  useEffect(() => {
    track("club_viewed", { clubId: club.id, clubName: club.name, city: club.city ?? "unknown" })
  }, [club.id, club.name, club.city])

  // Track section visibility via IntersectionObserver
  useEffect(() => {
    const options = { threshold: 0.4 }
    const observers: IntersectionObserver[] = []
    const observe = (ref: React.RefObject<HTMLElement | null>, eventName: string, extra: Record<string, string>) => {
      if (!ref.current) return
      let fired = false
      const obs = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !fired) {
          fired = true
          track(eventName, { clubId: club.id, clubName: club.name, ...extra })
        }
      }, options)
      obs.observe(ref.current)
      observers.push(obs)
    }
    observe(runsRef, "club_section_viewed", { section: "runs" })
    observe(descRef, "club_section_viewed", { section: "description" })
    observe(leaderboardRef, "club_section_viewed", { section: "leaderboard" })
    return () => observers.forEach((o) => o.disconnect())
  }, [club.id, club.name])

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user
      setUserId(user?.id ?? null)
      if (user) {
        const [{ data: sub }, { data: existingClaim }, { data: joinReq }, { data: chattable }] = await Promise.all([
          supabase.from("subscriptions").select("id, member_type").eq("user_id", user.id).eq("club_id", club.id).maybeSingle(),
          supabase.from("club_claims").select("id, status").eq("user_id", user.id).eq("club_id", club.id).maybeSingle(),
          supabase.from("membership_requests").select("status").eq("user_id", user.id).eq("club_id", club.id).maybeSingle(),
          supabase.rpc("my_chattable_run_ids"),
        ])
        setIsSubscribed(!!sub)
        if (existingClaim) setClaimStatus("pending")
        if (joinReq) setJoinRequestStatus(joinReq.status as any)
        setChattableRunIds(new Set(((chattable as { run_id: string }[]) || []).map((r) => r.run_id)))

        const paid = (sub as any)?.member_type === "paid"
        setIsPaidMember(paid)
        if (paid) {
          const today = localDateStr()
          const { data: mRuns } = await supabase
            .from("runs")
            .select("id, title, date, time, distance, meeting_point, tags, members_only")
            .eq("club_id", club.id)
            .eq("members_only", true)
            .gte("date", today)
            .order("date", { ascending: true })
            .order("time", { ascending: true })
          setMemberOnlyRuns((mRuns as Run[]) || [])
        }

        // Auto-subscribe when arriving via a join link (?join=1)
        if (searchParams.get("join") === "1" && !sub) {
          await supabase.from("subscriptions").upsert(
            { user_id: user.id, club_id: club.id },
            { onConflict: "user_id,club_id" }
          )
          setIsSubscribed(true)
          setMemberCount((p) => p + 1)
          setJoinBanner(true)
          track("club_followed", { clubId: club.id, clubName: club.name, source: "join_link" })
          setTimeout(() => setJoinBanner(false), 4000)
        }
      }
    }
    load()
  }, [club.id, searchParams])

  const handleFollow = async () => {
    if (!userId) { router.push("/login"); return }
    setSubscribing(true)
    if (isSubscribed) {
      await supabase.from("subscriptions").delete().eq("user_id", userId).eq("club_id", club.id)
      setIsSubscribed(false)
      setMemberCount((p) => Math.max(0, p - 1))
      track("club_unfollowed", { clubId: club.id, clubName: club.name })
    } else {
      await supabase.from("subscriptions").upsert({ user_id: userId, club_id: club.id }, { onConflict: "user_id,club_id" })
      setIsSubscribed(true)
      setMemberCount((p) => p + 1)
      track("club_followed", { clubId: club.id, clubName: club.name })
    }
    setSubscribing(false)
  }

  const handleCheckIn = async () => {
    if (!userId) { router.push("/login"); return }

    const checkinTarget = club.latitude != null && club.longitude != null
      ? { lat: club.latitude, lng: club.longitude, radiusMiles: CHECKIN_RADIUS_MILES }
      : cityFallback
        ? { lat: cityFallback.lat, lng: cityFallback.lng, radiusMiles: METRO_CHECKIN_RADIUS_MILES }
        : null

    if (!checkinTarget) {
      setCheckInError("This klub hasn't set a location yet, so check-in isn't available.")
      return
    }

    setCheckingIn(true)
    setCheckInError(null)

    try {
      const pos = await getCurrentPosition()
      const distance = getDistanceMiles(pos.coords.latitude, pos.coords.longitude, checkinTarget.lat, checkinTarget.lng)
      if (distance > checkinTarget.radiusMiles) {
        setCheckInError("You need to be at the klub to check in.")
        setCheckingIn(false)
        return
      }
    } catch {
      setCheckInError("Enable location access to check in.")
      setCheckingIn(false)
      return
    }

    const { data, error } = await checkInToClub(club.id)
    setCheckingIn(false)

    if (error || !data) {
      setCheckInError("Check-in failed. Try again.")
      return
    }

    setJustCheckedIn(true)
    track("club_checked_in", { clubId: club.id, clubName: club.name })
    setTimeout(() => setJustCheckedIn(false), 4000)

    if (data.club_first || data.city_first) {
      try {
        const raw = sessionStorage.getItem("runklub_just_unlocked")
        const unlocked = raw ? JSON.parse(raw) : { clubIds: [], cityIds: [] }
        if (data.club_first) unlocked.clubIds.push(club.id)
        if (data.city_first && data.city_id) unlocked.cityIds.push(data.city_id)
        sessionStorage.setItem("runklub_just_unlocked", JSON.stringify(unlocked))
      } catch { /* sessionStorage unavailable — unlock animation is a nice-to-have */ }
    }

    const [stampUrl, progress] = await Promise.all([
      getClubStampArt(club.id),
      getUserPassportProgress(),
    ])
    const justStampedCity = data.city_id ? progress.find((c) => c.city_id === data.city_id) ?? null : null
    const nearest = progress.find((c) => c.is_nearest_incomplete) ?? null
    const totalStamps = progress.reduce((sum, c) => sum + c.stamped_clubs, 0)
    const justStampedCityComplete = !!justStampedCity?.is_complete && data.city_first
    const isMilestone = totalStamps > 0 && totalStamps % 5 === 0

    // Share card only fires on a fresh stamp — city completion or every 5th
    // distinct klub — never on a repeat visit
    let shareCardUrl: string | null = null
    if (data.club_first && (justStampedCityComplete || isMilestone)) {
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
      isFirstTime: data.club_first,
      clubCount: data.club_count,
      totalStamps,
      justStampedCityComplete,
      justStampedCityName: justStampedCity?.city_name ?? null,
      nearestIncomplete: nearest ? { cityName: nearest.city_name, remaining: nearest.remaining } : null,
      shareCardUrl,
    })
  }

  const handleRequestJoin = async () => {
    if (!userId) { router.push("/login"); return }
    setRequestingJoin(true)
    const { error } = await supabase
      .from("membership_requests")
      .upsert({ user_id: userId, club_id: club.id, status: "pending" }, { onConflict: "club_id,user_id" })
    setRequestingJoin(false)
    if (!error) setJoinRequestStatus("pending")
  }

  const submitClaim = async () => {
    if (!userId) { router.push("/login"); return }
    setClaimSubmitting(true)
    const { error } = await supabase.from("club_claims").insert({
      club_id: club.id,
      user_id: userId,
      instagram: claimInstagram.trim().replace(/^@/, "") || null,
      message: claimMessage.trim() || null,
    })
    setClaimSubmitting(false)
    if (!error) {
      setClaimStatus("submitted")
      setShowClaimForm(false)
      track("club_claim_submitted", { clubId: club.id, clubName: club.name })
    }
  }

  const initials = club.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
  const gradient = getGradient(club.name)
  const todayStr = localDateStr()
  const publicUpcoming = runs.filter(r => r.date >= todayStr)
  const upcomingRuns = [...memberOnlyRuns, ...publicUpcoming].sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date) : (a.time ?? "").localeCompare(b.time ?? "")
  )

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">

      {/* ── JOIN BANNER ── */}
      {joinBanner && (
        <div className="fixed top-[var(--navbar-h)] left-0 right-0 z-50 flex justify-center px-4 pt-3 pointer-events-none">
          <div className="flex items-center gap-2.5 px-5 py-3 bg-[#c5f135] text-[#1a2110] rounded-2xl shadow-xl shadow-black/40 font-bold text-sm animate-[fadeUp_0.3s_ease-out_forwards]">
            <Heart className="w-4 h-4 fill-[#1a2110]" />
            You&apos;re now following {club.name}!
          </div>
        </div>
      )}

      {/* ── HERO HEADER ── */}
      <div className={`relative bg-gradient-to-b ${gradient} border-b border-[#2e3d1a]`}>
        {club.image_url && (
          <div className="absolute inset-0 overflow-hidden">
            <img src={club.image_url} alt="" className="w-full h-full object-cover opacity-20" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#111a0a]/60 to-[#111a0a]" />
          </div>
        )}

        <div className="relative max-w-2xl mx-auto px-5 pt-5 pb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-white/50 hover:text-white transition text-sm font-medium mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <div className="flex items-end gap-4">
            <div className={`w-20 h-20 rounded-2xl overflow-hidden shrink-0 bg-gradient-to-br ${gradient} flex items-center justify-center border border-white/10`}>
              {club.image_url
                ? <img src={club.image_url} alt={club.name} className="w-full h-full object-cover" />
                : <span className="text-2xl font-black text-white/30">{initials}</span>
              }
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-2xl font-black text-white leading-tight">{club.name}</h1>
                {(club.tier === "starter" || club.tier === "growth" || club.tier === "enterprise") && (
                  <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30">
                    <ShieldCheck className="w-2.5 h-2.5" /> VERIFIED
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {club.city && (
                  <p className="text-sm text-white/50 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{club.city}
                  </p>
                )}
                {memberCount >= 2 && (
                  <p className="text-sm text-white/50 flex items-center gap-1">
                    <Users className="w-3 h-3" />{memberCount} members
                  </p>
                )}
                {(() => {
                  const m = club.membership_type
                  const label = m === "optional_paid" ? "Free + Paid Options" : m === "paid_required" ? "Membership Required" : "Free to Join"
                  const cls = m === "optional_paid" ? "bg-amber-400/10 text-amber-400 border-amber-400/25" : m === "paid_required" ? "bg-orange-400/10 text-orange-400 border-orange-400/25" : "bg-[#c5f135]/10 text-[#c5f135] border-[#c5f135]/25"
                  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">

        {/* ── FOLLOW + INSTAGRAM ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleFollow}
            disabled={subscribing}
            title={isSubscribed ? "Remove from favorites" : "Add to favorites & turn on notifications"}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#2e3d1a] transition disabled:opacity-50 shrink-0"
          >
            <Heart className={`w-5 h-5 ${isSubscribed ? "fill-red-400 text-red-400" : "text-white/40"}`} />
          </button>

          {club.membership_type === "paid_required" && !isSubscribed ? (
            // Approval-gated club — show request flow
            <button
              onClick={joinRequestStatus === "none" ? handleRequestJoin : undefined}
              disabled={requestingJoin || joinRequestStatus !== "none"}
              className={`px-5 py-2.5 rounded-full text-sm font-black transition disabled:opacity-60 ${
                joinRequestStatus === "pending"
                  ? "bg-[#1e2d12] border border-white/20 text-white/50"
                  : joinRequestStatus === "rejected"
                  ? "bg-red-400/10 border border-red-400/30 text-red-400/70"
                  : "bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45]"
              }`}
            >
              {requestingJoin ? "…" : joinRequestStatus === "pending" ? "Request Pending" : joinRequestStatus === "rejected" ? "Request Declined" : "Request to Join"}
            </button>
          ) : (
            <button
              onClick={handleFollow}
              disabled={subscribing}
              className={`px-5 py-2.5 rounded-full text-sm font-black transition disabled:opacity-50 ${
                isSubscribed
                  ? "bg-[#1e2d12] border border-[#c5f135]/50 text-[#c5f135]"
                  : "bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45]"
              }`}
            >
              {subscribing ? "…" : isSubscribed ? "Joined" : "Join Klub"}
            </button>
          )}

          {userId && (
            <button
              onClick={handleCheckIn}
              disabled={checkingIn}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-black transition disabled:opacity-50 ${
                justCheckedIn
                  ? "bg-[#c5f135]/15 border border-[#c5f135]/30 text-[#c5f135]"
                  : "bg-[#1e2d12] border border-[#2e3d1a] text-white/70 hover:border-[#c5f135]/40 hover:text-white"
              }`}
            >
              <Stamp className="w-4 h-4" />
              {checkingIn ? "…" : justCheckedIn ? "Checked In!" : "Check In"}
            </button>
          )}

          {checkInError && (
            <p className="text-xs text-red-400/80 leading-relaxed w-full">{checkInError}</p>
          )}

          {club.instagram_handle && (
            <a
              href={`https://instagram.com/${club.instagram_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("club_instagram_clicked", { clubId: club.id, handle: club.instagram_handle ?? "" })}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#1e2d12] border border-[#2e3d1a] text-white/60 hover:text-white hover:border-white/30 transition text-sm font-semibold"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
              </svg>
              @{club.instagram_handle}
            </a>
          )}

          {club.website && (
            <a
              href={club.website.startsWith("http") ? club.website : `https://${club.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#1e2d12] border border-[#2e3d1a] text-white/60 hover:text-white hover:border-white/30 transition text-sm font-semibold"
            >
              <ExternalLink className="w-4 h-4 shrink-0" />
              Website
            </a>
          )}

          {!userId && (
            <p className="text-xs text-white/30 leading-relaxed w-full">
              Sign in to follow this klub and get run updates.
            </p>
          )}
        </div>

        {/* Meeting location */}
        {club.location && (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4">
            <div className="flex items-center gap-2 text-sm text-white/70">
              <MapPin className="w-4 h-4 text-[#c5f135] shrink-0" />
              <span>{club.location}</span>
            </div>
          </div>
        )}

        {/* Description */}
        {club.description && (
          <p ref={descRef} className="text-sm text-white/60 leading-relaxed">{club.description}</p>
        )}

        {/* ── UPCOMING RUNS ── */}
        <div ref={runsRef}>
          <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest px-1 mb-3">Upcoming Runs</h2>

          {/* Unclaimed notice */}
          {!isClaimed && (club.instagram_handle || club.website) && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-400/5 border border-amber-400/15 mb-3">
              <span className="text-amber-400/70 text-xs leading-relaxed mt-px">ℹ</span>
              <p className="text-xs text-white/40 leading-relaxed">
                This klub hasn&apos;t been claimed yet — verify run details on their{" "}
                {club.instagram_handle && (
                  <a
                    href={`https://www.instagram.com/${club.instagram_handle}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/60 underline underline-offset-2 hover:text-white/80 transition"
                  >
                    Instagram
                  </a>
                )}
                {club.instagram_handle && club.website && " or "}
                {club.website && (
                  <a
                    href={club.website.startsWith("http") ? club.website : `https://${club.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/60 underline underline-offset-2 hover:text-white/80 transition"
                  >
                    website
                  </a>
                )}
                {" "}before heading out.
              </p>
            </div>
          )}

          {upcomingRuns.length === 0 ? (
            <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
              <p className="text-white/40 text-sm">No upcoming runs scheduled.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingRuns.map((run) => {
                const d = new Date(run.date + "T00:00:00")
                const isToday = run.date === todayStr
                return (
                  <div
                    key={run.id}
                    className={`relative rounded-2xl border px-4 py-4 ${isToday ? "bg-[#c5f135]/5 border-[#c5f135]/25" : "bg-[#1e2d12] border-[#2e3d1a]"}`}
                  >
                    <div className="flex items-start gap-3">
                      {userId && chattableRunIds.has(run.id) && (
                        <button
                          onClick={() => setActiveChatRun(run)}
                          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#2e3d1a] flex items-center justify-center text-white/30 hover:text-[#c5f135] hover:bg-[#3d5220] transition"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <div className={`shrink-0 rounded-xl px-2.5 py-1.5 text-center min-w-[48px] ${isToday ? "bg-[#c5f135]/20" : "bg-[#2e3d1a]"}`}>
                        <p className={`text-[9px] font-bold uppercase tracking-wider ${isToday ? "text-[#c5f135]" : "text-white/40"}`}>
                          {isToday ? "TODAY" : d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                        </p>
                        <p className={`text-lg font-black leading-tight ${isToday ? "text-[#c5f135]" : "text-white"}`}>{d.getDate()}</p>
                        <p className={`text-[9px] font-semibold ${isToday ? "text-[#c5f135]/60" : "text-white/25"}`}>
                          {d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-white">{run.title}</p>
                          {run.members_only && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 border border-white/10">
                              MEMBERS
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/50 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          {formatTime(run.time)}
                          {run.distance && <><span className="text-white/20">·</span>{run.distance}</>}
                        </p>
                        {run.meeting_point && (
                          <p className="text-xs text-white/35 mt-0.5 flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{run.meeting_point}</span>
                          </p>
                        )}
                        {run.tags && run.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {run.tags.map((tag) => (
                              <span key={tag} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getTagStyle(tag)}`}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── LEADERBOARD ── */}
        <div ref={leaderboardRef}>
          <Leaderboard
            title="Leaderboard"
            userId={userId}
            fetchRows={(scope) => getClubLeaderboard(club.id, scope)}
            guestCopy="Sign in to see who's leading this klub."
          />
        </div>

        {/* ── CHAT SIGN-IN PROMPT (guests only) ── */}
        {!userId && upcomingRuns.length > 0 && (
          <button
            onClick={() => router.push("/login")}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#1e2d12] border border-[#2e3d1a] hover:border-[#c5f135]/30 transition text-left"
          >
            <div className="w-8 h-8 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-white/30" />
            </div>
            <div>
              <p className="text-sm font-bold text-white/60">Sign in to chat</p>
              <p className="text-xs text-white/30 mt-0.5">Ask questions about upcoming runs</p>
            </div>
          </button>
        )}

        {/* ── CLAIM THIS CLUB ── */}
        {!isClaimed && userId && claimStatus === "idle" && !showClaimForm && (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-white">Is this your klub?</p>
              <p className="text-xs text-white/40 mt-0.5">Claim it to manage runs and connect with members.</p>
            </div>
            <button
              onClick={() => { setShowClaimForm(true); track("club_claim_opened", { clubId: club.id, clubName: club.name }) }}
              className="shrink-0 px-4 py-2 rounded-full border border-[#c5f135]/40 text-[#c5f135] text-xs font-black hover:bg-[#c5f135]/10 transition"
            >
              Claim Klub
            </button>
          </div>
        )}

        {!isClaimed && userId && showClaimForm && claimStatus === "idle" && (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">Claim this klub</p>
              <button onClick={() => setShowClaimForm(false)} className="text-white/30 hover:text-white/60 transition text-xs">
                Cancel
              </button>
            </div>
            <p className="text-xs text-white/40 leading-relaxed">
              We'll review your claim and link your account as the klub manager. We may reach out to verify.
            </p>
            <div>
              <label className="block text-xs font-semibold text-white/50 mb-1.5">Your Instagram handle <span className="font-normal text-white/25">(helps us verify)</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm pointer-events-none">@</span>
                <input
                  value={claimInstagram}
                  onChange={(e) => setClaimInstagram(e.target.value.replace(/^@/, ""))}
                  placeholder="yourhandle"
                  className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl pl-7 pr-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/50 mb-1.5">Anything else we should know? <span className="font-normal text-white/25">(optional)</span></label>
              <textarea
                value={claimMessage}
                onChange={(e) => setClaimMessage(e.target.value)}
                placeholder="e.g. I'm the founder, here's our website…"
                rows={3}
                className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition resize-none"
              />
            </div>
            <button
              onClick={submitClaim}
              disabled={claimSubmitting}
              className="w-full py-3 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-xl disabled:opacity-40 hover:bg-[#d4ff45] transition"
            >
              {claimSubmitting ? "Submitting…" : "Submit Claim"}
            </button>
          </div>
        )}

        {(claimStatus === "pending" || claimStatus === "submitted") && (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-5 flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-[#c5f135] shrink-0 mt-1.5" />
            <div>
              <p className="text-sm font-bold text-white">
                {claimStatus === "submitted" ? "Claim submitted!" : "Claim pending review"}
              </p>
              <p className="text-xs text-white/40 mt-0.5">
                We'll review and reach out to link your account as the klub manager.
              </p>
            </div>
          </div>
        )}

        {/* CTA for unauthenticated users */}
        {!userId && (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-6 text-center">
            <p className="text-white font-bold text-sm mb-1">Want to join this klub?</p>
            <p className="text-white/40 text-xs mb-4">Create a free account to follow runs and connect with members.</p>
            <button
              onClick={() => router.push("/login")}
              className="px-6 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition"
            >
              Get Started — It&apos;s Free
            </button>
          </div>
        )}
      </div>

      {/* ── RUN CHAT PANEL ── */}
      {activeChatRun && userId && (
        <RunChatPanel
          run={{
            id: activeChatRun.id,
            title: activeChatRun.title,
            date: activeChatRun.date,
            time: activeChatRun.time,
            distance: activeChatRun.distance,
            meeting_point: activeChatRun.meeting_point,
            clubName: club.name,
            clubImageUrl: club.image_url,
          }}
          userId={userId}
          onClose={() => setActiveChatRun(null)}
        />
      )}

      {/* ── CHECK-IN MOMENT ── */}
      {checkInMoment && (
        <CheckInMoment {...checkInMoment} onDone={() => setCheckInMoment(null)} />
      )}
    </div>
  )
}
