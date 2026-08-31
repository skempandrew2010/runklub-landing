"use client"

import { useEffect, useState } from "react"
import { X, Sparkles } from "lucide-react"
import { getChallengesWithProgress, type ChallengeWithProgress } from "@/lib/challenges"
import { CHALLENGE_ICONS } from "@/components/ChallengeCard"
import { resolveCheckinTarget, getCurrentPosition, isWithinRadius, isWithinCheckinWindow, CHECKIN_WINDOW_ERROR_MESSAGE } from "@/lib/checkinGeofence"
import { isVerifiedClub } from "@/utils/clubTier"
import CheckInProximityMap from "@/components/CheckInProximityMap"
import type { CheckInResult } from "@/lib/server/checkin"
import ModalPortal from "@/components/ModalPortal"

export type MissionCheckInRun = {
  id: string
  title: string
  date: string
  time: string
  timezone: string | null
  run_lat: number | null
  run_lng: number | null
}

export type MissionCheckInClub = {
  name: string
  latitude: number | null
  longitude: number | null
  tier: string | null
  waiver_url?: string | null
}

/** Shown before a check-in completes: pick which Mission to spotlight, then confirm location + submit. */
export default function MissionCheckInModal({
  run,
  club,
  cityFallback,
  sessionToken,
  onClose,
  onCheckedIn,
}: {
  run: MissionCheckInRun
  club: MissionCheckInClub
  cityFallback: { lat: number; lng: number } | null
  sessionToken: string
  onClose: () => void
  onCheckedIn: (result: CheckInResult) => void
}) {
  const [missions, setMissions] = useState<ChallengeWithProgress[]>([])
  const [loadingMissions, setLoadingMissions] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkingIn, setCheckingIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [positionError, setPositionError] = useState<string | null>(null)

  const target = resolveCheckinTarget(run, club, cityFallback)

  useEffect(() => {
    getChallengesWithProgress().then((list) => {
      const incomplete = list.filter((c) => !c.completed)
      setMissions(incomplete)
      setSelectedId(incomplete[0]?.id ?? null)
      setLoadingMissions(false)
    })
  }, [])

  // Best-effort - just for the proximity map, so a denial here shouldn't
  // block anything; the real gate re-reads a fresh position in submit().
  useEffect(() => {
    if (!target) return
    getCurrentPosition()
      .then((pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
      .catch(() => setPositionError("Enable location to see how close you are"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async () => {
    setError(null)

    if (!isWithinCheckinWindow(run.date, run.time, run.timezone)) {
      setError(CHECKIN_WINDOW_ERROR_MESSAGE)
      return
    }

    if (isVerifiedClub(club.tier)) {
      if (!target) {
        setError("This run hasn't set a location yet, so check-in isn't available.")
        return
      }
      setCheckingIn(true)
      try {
        const pos = await getCurrentPosition()
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setPositionError(null)
        if (!isWithinRadius(pos, target)) {
          setError("You need to be at the run to check in.")
          setCheckingIn(false)
          return
        }
      } catch {
        setPositionError("Enable location to see how close you are")
        setError("Enable location access to check in.")
        setCheckingIn(false)
        return
      }
    } else {
      setCheckingIn(true)
    }

    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ run_id: run.id, selected_challenge_id: selectedId }),
    })
    const data = await res.json()
    setCheckingIn(false)

    if (!res.ok) {
      setError(data.error || "Check-in failed. Try again.")
      return
    }

    onCheckedIn(data)
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-sm max-h-[85vh] overflow-y-auto bg-[#1e2d12] border border-[#2e3d1a] rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5 animate-[fadeUp_0.25s_ease-out_forwards]">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-lg font-black text-white">Check In</p>
            <p className="text-xs text-white/40 mt-0.5">{run.title} · {club.name}</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <CheckInProximityMap target={target} position={position} positionError={positionError} />

        {!loadingMissions && missions.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold text-white/60 mb-2">Which mission should this count toward?</p>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {missions.map((m, i) => {
                const Icon = CHALLENGE_ICONS[m.slug] || Sparkles
                const isSelected = selectedId === m.id
                const isSuggested = i === 0
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition text-left ${
                      isSelected
                        ? "bg-[#c5f135]/10 border-[#c5f135]/50"
                        : "bg-[#1a2110] border-[#2e3d1a] hover:border-white/20"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        isSelected ? "bg-[#c5f135]/15" : "bg-[#2e3d1a]"
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isSelected ? "text-[#c5f135]" : "text-white/40"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white truncate">{m.name}</span>
                        {isSuggested && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110] shrink-0">
                            SUGGESTED
                          </span>
                        )}
                      </div>
                      {m.metricLabel && (
                        <p className="text-[11px] text-white/40 mt-0.5">
                          {m.current} of {m.target} {m.metricLabel}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <button
          onClick={submit}
          disabled={checkingIn}
          className="w-full mt-5 py-3 rounded-2xl text-sm font-black bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] active:scale-95 transition disabled:opacity-40"
        >
          {checkingIn ? "Checking in…" : "Check In"}
        </button>
        {error && <p className="text-xs text-red-400/80 leading-relaxed mt-2">{error}</p>}
      </div>
    </div>
    </ModalPortal>
  )
}
