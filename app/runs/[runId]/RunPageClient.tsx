"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Clock, MapPin, MessageSquare, CheckCircle2, ExternalLink } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { localDateStr } from "@/utils/dates"
import { getTagStyle } from "@/utils/tagStyle"
import RunChatPanel from "@/components/RunChatPanel"
import MissionCheckInModal from "@/components/MissionCheckInModal"
import CheckInCelebration from "@/components/CheckInCelebration"
import type { CheckInResult } from "@/lib/server/checkin"

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
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
  const [celebrationData, setCelebrationData] = useState<CheckInResult | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [showMissionModal, setShowMissionModal] = useState(false)

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

  const openCheckIn = () => {
    if (!userId || !sessionToken) { router.push("/login"); return }
    setShowMissionModal(true)
  }

  /** Runs after MissionCheckInModal's own geolocation check + /api/checkin call succeed. */
  const handleCheckedIn = (data: CheckInResult) => {
    setShowMissionModal(false)
    setCheckedIn(true)
    // A run only ever gets one check-in per user — if this was a repeat call
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
