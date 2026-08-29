"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Clock, MapPin, CheckCircle2, ExternalLink, PartyPopper, Crown, Lock } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { mondayOf } from "@/utils/dates"
import { getTagStyle } from "@/utils/tagStyle"
import { formatRunTime, runStartInstant, type TimedRun } from "@/lib/timezone"
import RunChatPanel, { type DmTarget } from "@/components/RunChatPanel"
import { useKlubMessaging } from "@/hooks/useKlubMessaging"
import MessagingSidebar from "@/components/MessagingSidebar"
import MissionCheckInModal from "@/components/MissionCheckInModal"
import CheckInCelebration from "@/components/CheckInCelebration"
import CheckInProximityMap from "@/components/CheckInProximityMap"
import { resolveCheckinTarget, getCurrentPosition } from "@/lib/checkinGeofence"
import WaiverAckModal from "@/components/WaiverAckModal"
import { needsWaiverAck, acknowledgeWaiver } from "@/lib/waiver"
import type { CheckInResult } from "@/lib/server/checkin"
import { type WorkoutSegment, formatWorkoutSegment, parseWorkoutStructure } from "@/lib/workouts"

function formatTime(run: TimedRun) {
  return formatRunTime(run)
}

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

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
  timezone: string | null
  run_lat: number | null
  run_lng: number | null
  passport_credit_value: number | null
  passport_checkin_limit: number | null
  workout: { title: string; description: string | null; structure: WorkoutSegment[] } | null
}

export type Club = {
  id: string
  name: string
  user_id: string
  image_url: string | null
  latitude: number | null
  longitude: number | null
  city: string | null
  tier: string | null
  waiver_url: string | null
  passport_program_enrolled: boolean
  passport_default_credit_value: number
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
  const [celebrationData, setCelebrationData] = useState<CheckInResult | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [dmTarget, setDmTarget] = useState<DmTarget | null>(null)
  const [myPaceGroupId, setMyPaceGroupId] = useState<string | null>(null)
  const [showMissionModal, setShowMissionModal] = useState(false)
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [positionError, setPositionError] = useState<string | null>(null)
  const [personalizedWorkout, setPersonalizedWorkout] = useState<{ title: string; description: string | null; structure: WorkoutSegment[] } | null>(null)
  const [rsvpCount, setRsvpCount] = useState(0)
  const [myRsvp, setMyRsvp] = useState(false)
  const [rsvpSaving, setRsvpSaving] = useState(false)
  const [showWaiverModal, setShowWaiverModal] = useState(false)
  // Ticks once a minute so the "check in up to 10 minutes before" gate
  // actually opens on its own while the page is sitting open, instead of
  // needing a refresh to notice the window arrived.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Passport: whether the viewer belongs to this klub at all (director,
  // subscription, or active member) -- the gate below only ever applies to
  // non-members, since Passport is specifically for checking into klubs you
  // don't belong to.
  const [membershipChecked, setMembershipChecked] = useState(false)
  const [isKlubMember, setIsKlubMember] = useState(false)
  const [passportSubscribed, setPassportSubscribed] = useState(false)
  const [passportCreditBalance, setPassportCreditBalance] = useState(0)
  const [passportRedeemed, setPassportRedeemed] = useState(false)
  const [redeemingPassport, setRedeemingPassport] = useState(false)
  const [passportError, setPassportError] = useState<string | null>(null)
  const [passportShortfall, setPassportShortfall] = useState<number | null>(null)
  const [buyingShortfall, setBuyingShortfall] = useState(false)

  // Fetched client-side (not server-side with the anon key) so RLS evaluates
  // as the actual signed-in visitor - otherwise an approved member clicking
  // a shared link to their own private run would incorrectly see "not found."
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("runs")
        .select(
          "id, club_id, title, date, time, distance, meeting_point, city, external_url, description, tags, is_in_person, members_only, timezone, run_lat, run_lng, passport_credit_value, passport_checkin_limit, clubs(id, name, user_id, image_url, latitude, longitude, city, tier, waiver_url, passport_program_enrolled, passport_default_credit_value), workout:workout_type_id(title, description, structure)"
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
        timezone: data.timezone,
        run_lat: data.run_lat,
        run_lng: data.run_lng,
        passport_credit_value: data.passport_credit_value,
        passport_checkin_limit: data.passport_checkin_limit,
        workout: data.workout
          ? {
              title: (data.workout as any).title,
              description: (data.workout as any).description,
              structure: parseWorkoutStructure((data.workout as any).structure),
            }
          : null,
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
    if (!userId || !run) { setMyPaceGroupId(null); return }
    supabase
      .from("subscriptions")
      .select("pace_group_id")
      .eq("club_id", run.club_id)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setMyPaceGroupId((data as any)?.pace_group_id ?? null))
  }, [userId, run])

  const { director, coach: myCoach } = useKlubMessaging(run?.club_id ?? "", club?.user_id, userId, myPaceGroupId)

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

  useEffect(() => {
    if (!run) return
    supabase
      .from("rsvps")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id)
      .eq("going", true)
      .then(({ count }) => setRsvpCount(count ?? 0))
    if (userId) {
      supabase
        .from("rsvps")
        .select("going")
        .eq("run_id", run.id)
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data }) => setMyRsvp(!!data?.going))
    }
  }, [userId, run])

  // Only relevant for runs at a Passport-enrolled klub -- figure out if the
  // viewer already belongs (gate never applies to members), and if not,
  // whether they're a Passport subscriber with enough credits to redeem.
  useEffect(() => {
    if (!run || !club || !club.passport_program_enrolled) { setMembershipChecked(true); return }
    if (!userId) { setIsKlubMember(false); setMembershipChecked(true); return }
    let cancelled = false
    const load = async () => {
      const isDirector = club.user_id === userId
      const [{ data: sub }, { data: member }, { data: passportSub }, { data: alreadyRedeemed }] = await Promise.all([
        supabase.from("subscriptions").select("id").eq("club_id", run.club_id).eq("user_id", userId).maybeSingle(),
        supabase.from("members").select("id").eq("club_id", run.club_id).eq("user_id", userId).eq("status", "active").maybeSingle(),
        supabase.from("passport_subscriptions").select("id").eq("user_id", userId).eq("status", "active").maybeSingle(),
        supabase.from("passport_checkins").select("id").eq("run_id", run.id).eq("user_id", userId).maybeSingle(),
      ])
      if (cancelled) return
      setIsKlubMember(isDirector || !!sub || !!member)
      setPassportSubscribed(!!passportSub)
      setPassportRedeemed(!!alreadyRedeemed)
      if (passportSub) {
        const { data: batches } = await supabase
          .from("passport_credit_batches")
          .select("credits_remaining, expires_at")
          .eq("user_id", userId)
          .eq("status", "active")
          .gt("credits_remaining", 0)
        if (cancelled) return
        const now = new Date()
        const balance = (batches ?? []).filter((b) => new Date(b.expires_at) > now).reduce((sum, b) => sum + b.credits_remaining, 0)
        setPassportCreditBalance(balance)
      }
      setMembershipChecked(true)
    }
    load()
    return () => { cancelled = true }
  }, [userId, run, club])

  const passportCreditValue = run && club ? (run.passport_credit_value ?? club.passport_default_credit_value) : null
  const passportGateActive = !!(
    membershipChecked && club?.passport_program_enrolled && !isKlubMember && run && !run.members_only && !run.external_url && !passportRedeemed
  )

  const redeemPassportCredits = async () => {
    if (!run || !club) return
    if (!userId || !sessionToken) { router.push("/login"); return }
    setRedeemingPassport(true)
    setPassportError(null)
    setPassportShortfall(null)
    try {
      const res = await fetch("/api/passport/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ club_id: club.id, run_id: run.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        const match = /insufficient_credits: have (\d+), need (\d+)/.exec(json.error ?? "")
        if (match) setPassportShortfall(Number(match[2]) - Number(match[1]))
        else setPassportError(json.error ?? "Could not redeem credits")
        return
      }
      setPassportRedeemed(true)
    } catch {
      setPassportError("Could not redeem credits. Try again.")
    } finally {
      setRedeemingPassport(false)
    }
  }

  const buyShortfallCredits = async () => {
    if (passportShortfall == null || !sessionToken) return
    setBuyingShortfall(true)
    try {
      const res = await fetch("/api/passport/buy-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ credits: passportShortfall, returnPath: `/runs/${runId}` }),
      })
      const json = await res.json()
      if (json.url) window.location.href = json.url
      else { setPassportError(json.error ?? "Could not start checkout"); setBuyingShortfall(false) }
    } catch {
      setPassportError("Could not start checkout. Try again.")
      setBuyingShortfall(false)
    }
  }

  const toggleRsvp = async () => {
    if (!run) return
    if (!userId) { router.push("/login"); return }
    const next = !myRsvp
    setMyRsvp(next)
    setRsvpCount((c) => Math.max(0, c + (next ? 1 : -1)))
    setRsvpSaving(true)
    await supabase.from("rsvps").upsert(
      { run_id: run.id, user_id: userId, going: next, updated_at: new Date().toISOString() },
      { onConflict: "run_id,user_id" }
    )
    setRsvpSaving(false)
  }

  // For members-only runs shared across pace groups, show the viewer their own
  // group's workout for this day (from the Weekly Training Schedule) instead of
  // whatever single workout the run itself might have set.
  useEffect(() => {
    if (!userId || !run || !run.members_only) { setPersonalizedWorkout(null); return }
    let cancelled = false
    const load = async () => {
      const { data: member } = await supabase
        .from("members")
        .select("pace_group_id")
        .eq("club_id", run.club_id)
        .eq("user_id", userId)
        .maybeSingle()
      if (cancelled || !member?.pace_group_id) { if (!cancelled) setPersonalizedWorkout(null); return }

      const runDate = new Date(`${run.date}T00:00:00`)
      const { data: sched } = await supabase
        .from("club_weekly_schedule")
        .select("workout_type_id")
        .eq("pace_group_id", member.pace_group_id)
        .eq("day_of_week", runDate.getDay())
        .eq("week_of", mondayOf(runDate))
        .maybeSingle()
      if (cancelled || !sched?.workout_type_id) { if (!cancelled) setPersonalizedWorkout(null); return }

      const { data: workout } = await supabase
        .from("runs")
        .select("title, description, structure")
        .eq("id", sched.workout_type_id)
        .maybeSingle()
      if (!cancelled) {
        setPersonalizedWorkout(workout ? { title: workout.title, description: workout.description, structure: parseWorkoutStructure(workout.structure) } : null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [userId, run])

  // Best-effort - just for the "how far away am I" readout, so a denial
  // here shouldn't block anything else on the page.
  useEffect(() => {
    if (!run || !club || !run.is_in_person) return
    if (!resolveCheckinTarget(run, club, cityFallback)) return
    getCurrentPosition()
      .then((pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
      .catch(() => setPositionError("Enable location to see how close you are"))
  }, [run, club, cityFallback])

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

  const minutesUntilStart = (runStartInstant(run).getTime() - now) / 60_000
  const checkInEligible = run.is_in_person && !passportGateActive
  const canCheckIn = checkInEligible && minutesUntilStart <= 10
  const checkInTooEarly = checkInEligible && !canCheckIn

  const openCheckIn = async () => {
    if (!userId || !sessionToken) { router.push("/login"); return }
    if (club && (await needsWaiverAck(userId, club.id, club.waiver_url))) {
      setShowWaiverModal(true)
      return
    }
    setShowMissionModal(true)
  }

  const handleWaiverAcknowledged = async () => {
    if (!userId || !club) return
    await acknowledgeWaiver(userId, club.id)
    setShowWaiverModal(false)
    setShowMissionModal(true)
  }

  /** Runs after MissionCheckInModal's own geolocation check + /api/checkin call succeed. */
  const handleCheckedIn = (data: CheckInResult) => {
    setShowMissionModal(false)
    setCheckedIn(true)
    // A run only ever gets one check-in per user - if this was a repeat call
    // (e.g. the button and the watcher racing), there's nothing new to celebrate.
    if (!data.alreadyCheckedIn) setCelebrationData(data)
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
              {new Date(run.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              {passportGateActive ? null : <> at {formatTime(run)}</>}
            </span>
            {run.distance && <span>{run.distance}</span>}
            {run.members_only && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 border border-white/10">
                MEMBERS
              </span>
            )}
            {club.passport_program_enrolled && (
              <span className="flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#c5f135]/10 text-[#c5f135] border border-[#c5f135]/30">
                <Crown className="w-2.5 h-2.5" /> PASSPORT
              </span>
            )}
          </div>

          {passportGateActive ? (
            <p className="flex items-center gap-1.5 text-sm text-white/40 mb-3">
              <Lock className="w-3.5 h-3.5 shrink-0" /> Time and location unlock after you redeem credits
            </p>
          ) : run.meeting_point ? (
            <p className="flex items-center gap-1.5 text-sm text-white/50 mb-3">
              <MapPin className="w-3.5 h-3.5 text-[#c5f135] shrink-0" /> {run.meeting_point}
            </p>
          ) : run.city && (
            <p className="flex items-center gap-1.5 text-sm text-white/50 mb-3">
              <MapPin className="w-3.5 h-3.5 text-[#c5f135] shrink-0" /> {run.city}
            </p>
          )}

          {passportGateActive && (
            <div className="rounded-2xl border border-[#c5f135]/30 bg-gradient-to-br from-[#c5f135]/10 to-[#1e2d12] p-4 mb-4">
              <p className="text-sm text-white/70 leading-relaxed mb-3">
                {club.name} is on the Passport network. Redeem credits to unlock this event&apos;s time and location, and to message the director.
              </p>
              {passportError && <p className="text-xs text-red-300 mb-3">{passportError}</p>}
              {!userId ? (
                <button
                  onClick={() => router.push("/login")}
                  className="w-full py-3 rounded-2xl text-sm font-black bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] transition"
                >
                  Sign in to use Passport
                </button>
              ) : !passportSubscribed ? (
                <Link
                  href="/passport/credits"
                  className="block w-full text-center py-3 rounded-2xl text-sm font-black bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] transition"
                >
                  Get Passport to attend
                </Link>
              ) : passportShortfall != null ? (
                <button
                  onClick={buyShortfallCredits}
                  disabled={buyingShortfall}
                  className="w-full py-3 rounded-2xl text-sm font-black bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] transition disabled:opacity-50"
                >
                  {buyingShortfall ? "…" : `Buy ${passportShortfall} credit${passportShortfall === 1 ? "" : "s"} ($${(passportShortfall * 6).toFixed(2)}) to attend`}
                </button>
              ) : (
                <button
                  onClick={redeemPassportCredits}
                  disabled={redeemingPassport || passportCreditValue == null}
                  className="w-full py-3 rounded-2xl text-sm font-black bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] transition disabled:opacity-50"
                >
                  {redeemingPassport
                    ? "…"
                    : `Use ${passportCreditValue} credit${passportCreditValue === 1 ? "" : "s"} to attend`}
                </button>
              )}
              {passportSubscribed && passportShortfall == null && (
                <p className="text-xs text-white/40 text-center mt-2">{passportCreditBalance} credit{passportCreditBalance === 1 ? "" : "s"} available</p>
              )}
            </div>
          )}

          {!run.external_url && !passportGateActive && (
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="flex items-center gap-1.5 text-sm text-white/50">
                <PartyPopper className="w-3.5 h-3.5 text-[#c5f135]" />
                {rsvpCount} going
              </span>
              <button
                onClick={toggleRsvp}
                disabled={rsvpSaving}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black transition disabled:opacity-50 ${
                  myRsvp
                    ? "bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30"
                    : "bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45]"
                }`}
              >
                {myRsvp ? "I'm Going ✓" : "RSVP"}
              </button>
            </div>
          )}

          {run.is_in_person && !passportGateActive && (
            <div className="mb-4">
              <CheckInProximityMap
                target={resolveCheckinTarget(run, club, cityFallback)}
                position={position}
                positionError={positionError}
              />
            </div>
          )}

          {(personalizedWorkout ?? run.workout) && (() => {
            const effectiveWorkout = personalizedWorkout ?? run.workout!
            return (
              <div className="bg-[#1e2d12] border border-[#c5f135]/25 rounded-2xl p-4 mb-4">
                <p className="text-[10px] font-black text-[#c5f135] uppercase tracking-widest mb-1.5">
                  {personalizedWorkout ? "Your Workout" : "Today's Workout"} · {effectiveWorkout.title}
                </p>
                {effectiveWorkout.structure.length > 0 && (
                  <ul className="space-y-1 mb-2">
                    {effectiveWorkout.structure.map((seg, i) => (
                      <li key={i} className="text-sm text-white/90 font-semibold">{formatWorkoutSegment(seg)}</li>
                    ))}
                  </ul>
                )}
                {effectiveWorkout.description && (
                  <p className="text-sm text-white/70 leading-relaxed">{effectiveWorkout.description}</p>
                )}
              </div>
            )
          })()}

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

          {checkInTooEarly && (
            <div className="w-full py-3 rounded-2xl text-sm font-bold text-center bg-[#1a2110] border border-[#2e3d1a] text-white/50">
              This run starts {formatTime(run)} on {new Date(run.date + "T00:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })} - check in up to 10 minutes before it starts
            </div>
          )}

          {canCheckIn && (
            <button
              onClick={() => !checkedIn && openCheckIn()}
              disabled={checkedIn}
              className={`w-full py-3 rounded-2xl text-sm font-black transition flex items-center justify-center gap-2 ${
                checkedIn
                  ? "bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30 cursor-default"
                  : "bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] active:scale-95"
              }`}
            >
              {checkedIn ? (
                <><CheckCircle2 className="w-4 h-4" /> Checked In</>
              ) : (
                "Check In"
              )}
            </button>
          )}
        </div>

        <MessagingSidebar
          loggedIn={!!userId}
          currentUserId={userId}
          director={director}
          coach={myCoach}
          groupChatLabel={run.title}
          groupChatSubtitle="Run chat"
          onOpenGroupChat={() => setShowChat(true)}
          onOpenDirector={() => director && setDmTarget({ userId: director.userId, name: director.name, avatarUrl: director.avatarUrl })}
          onOpenCoach={() => myCoach && setDmTarget({ userId: myCoach.userId, name: myCoach.name, avatarUrl: myCoach.avatarUrl })}
          onRequireLogin={() => router.push("/login")}
        />
      </div>

      {showChat && userId && (
        <RunChatPanel
          target={{
            type: "run",
            id: run.id,
            title: run.title,
            date: run.date,
            time: run.time,
            timezone: run.timezone,
            distance: run.distance,
            meeting_point: run.meeting_point,
            clubName: club.name,
            clubImageUrl: club.image_url,
          }}
          userId={userId}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Director/coach DMs are club-scoped (not run-scoped) so the same
          conversation carries across every run at this klub. */}
      {dmTarget && userId && (
        <RunChatPanel
          target={{
            type: "club",
            id: run.club_id,
            clubName: club.name,
            clubImageUrl: club.image_url,
          }}
          userId={userId}
          initialDm={dmTarget}
          onClose={() => setDmTarget(null)}
        />
      )}

      {showWaiverModal && club?.waiver_url && (
        <WaiverAckModal
          clubName={club.name}
          waiverUrl={club.waiver_url}
          onAcknowledge={handleWaiverAcknowledged}
          onClose={() => setShowWaiverModal(false)}
        />
      )}

      {showMissionModal && sessionToken && (
        <MissionCheckInModal
          run={run}
          club={club}
          cityFallback={cityFallback}
          sessionToken={sessionToken}
          onClose={() => setShowMissionModal(false)}
          onCheckedIn={handleCheckedIn}
        />
      )}

      {celebrationData && userId && (
        <CheckInCelebration
          data={celebrationData}
          runId={run.id}
          clubId={run.club_id}
          clubName={club.name}
          userId={userId}
          onDone={() => setCelebrationData(null)}
        />
      )}
    </div>
  )
}
