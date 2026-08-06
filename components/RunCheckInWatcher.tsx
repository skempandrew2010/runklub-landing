"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { localDateStr } from "@/utils/dates"
import { getDistanceMiles } from "@/utils/distance"
import {
  resolveCheckinTarget,
  getCurrentPosition,
  isWithinCheckinWindow,
  PROXIMITY_CHECKIN_RADIUS_MILES,
} from "@/lib/checkinGeofence"
import MissionCheckInModal, { type MissionCheckInRun, type MissionCheckInClub } from "@/components/MissionCheckInModal"
import CheckInCelebration from "@/components/CheckInCelebration"
import type { CheckInResult } from "@/lib/server/checkin"

const POLL_INTERVAL_MS = 45_000

type CandidateRun = MissionCheckInRun & { club_id: string }
type CelebrationState = { data: CheckInResult; run: CandidateRun; clubName: string }

/** Proactively prompts a member to check in once they're within 0.1mi of a run they're about to start (or just started). Runs only while the app is open in the foreground. */
export default function RunCheckInWatcher() {
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<{ run: CandidateRun; club: MissionCheckInClub } | null>(null)
  const [celebration, setCelebration] = useState<CelebrationState | null>(null)
  const pausedRef = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null)
      setSessionToken(session?.access_token ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
      setSessionToken(session?.access_token ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return

    const poll = async () => {
      if (pausedRef.current || typeof document === "undefined" || document.visibilityState !== "visible") return

      const { data: subs } = await supabase.from("subscriptions").select("club_id").eq("user_id", userId)
      const clubIds = (subs || []).map((s: { club_id: string }) => s.club_id)
      if (clubIds.length === 0) return

      const today = localDateStr()
      const { data: runs } = await supabase
        .from("runs")
        .select("id, title, date, time, run_lat, run_lng, club_id, clubs(name, latitude, longitude, tier)")
        .in("club_id", clubIds)
        .eq("kind", "run")
        .eq("is_in_person", true)
        .eq("date", today)
      if (!runs || runs.length === 0) return

      const inWindow = (runs as any[]).filter((r) => r.time && isWithinCheckinWindow(r.date, r.time))
      if (inWindow.length === 0) return

      const runIds = inWindow.map((r) => r.id)
      const { data: existing } = await supabase
        .from("run_checkins")
        .select("run_id")
        .eq("user_id", userId)
        .in("run_id", runIds)
      const alreadyCheckedIn = new Set((existing || []).map((c: { run_id: string }) => c.run_id))

      for (const r of inWindow) {
        if (alreadyCheckedIn.has(r.id) || !r.clubs) continue
        const target = resolveCheckinTarget(r, r.clubs, null, { includeCityFallback: false })
        if (!target) continue

        // Only ask for location once we already have a real time-window match —
        // keeps the permission prompt rare instead of firing on every poll.
        try {
          const pos = await getCurrentPosition()
          const distance = getDistanceMiles(pos.coords.latitude, pos.coords.longitude, target.lat, target.lng)
          if (distance <= PROXIMITY_CHECKIN_RADIUS_MILES) {
            pausedRef.current = true
            setPrompt({
              run: { id: r.id, title: r.title, date: r.date, time: r.time, run_lat: r.run_lat, run_lng: r.run_lng, club_id: r.club_id },
              club: r.clubs,
            })
            return
          }
        } catch {
          // Location unavailable/denied — nothing to do, try again next poll.
        }
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [userId])

  const dismissPrompt = () => {
    pausedRef.current = false
    setPrompt(null)
  }

  const handleCheckedIn = (data: CheckInResult) => {
    // A run only ever gets one check-in per user — if this was a repeat call,
    // there's nothing new to celebrate, so just dismiss the prompt. Only the
    // celebration's onDone resets pausedRef otherwise, so do it here too or
    // the watcher would stay paused for the rest of the session.
    if (prompt && !data.alreadyCheckedIn) {
      setCelebration({ data, run: prompt.run, clubName: prompt.club.name })
    } else {
      pausedRef.current = false
    }
    setPrompt(null)
  }

  if (celebration && userId) {
    return (
      <CheckInCelebration
        data={celebration.data}
        runId={celebration.run.id}
        clubId={celebration.run.club_id}
        clubName={celebration.clubName}
        userId={userId}
        onDone={() => { setCelebration(null); pausedRef.current = false }}
      />
    )
  }

  if (!prompt || !sessionToken) return null

  return (
    <MissionCheckInModal
      run={prompt.run}
      club={prompt.club}
      cityFallback={null}
      sessionToken={sessionToken}
      onClose={dismissPrompt}
      onCheckedIn={handleCheckedIn}
    />
  )
}
