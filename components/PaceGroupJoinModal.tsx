"use client"

import { useState } from "react"
import { X } from "lucide-react"
import type { PaceGroup } from "@/lib/clubModel/types"
import { formatPaceRange, parsePace } from "@/lib/clubModel/pace"
import { matchPaceGroup } from "@/lib/clubModel/matching"
import { RACE_DISTANCE_LABELS, type RaceDistance, parseRaceTime, raceTimeToMarathonPace, marathonTimeRangeLabel } from "@/lib/clubModel/raceEquivalency"
import { Select } from "@/components/Select"

export type PaceGroupJoinResult = {
  paceGroupId: string
  selfReportedPace: number | null
  raceDistance: RaceDistance | "pace" | null
  raceTimeSeconds: number | null
}

type Distance = RaceDistance | "pace"

const DISTANCE_OPTIONS: { value: Distance; label: string; placeholder: string }[] = [
  { value: "mile", label: RACE_DISTANCE_LABELS.mile, placeholder: "e.g. 7:30" },
  { value: "5k", label: RACE_DISTANCE_LABELS["5k"], placeholder: "e.g. 24:00" },
  { value: "10k", label: RACE_DISTANCE_LABELS["10k"], placeholder: "e.g. 50:00" },
  { value: "half", label: RACE_DISTANCE_LABELS.half, placeholder: "e.g. 1:50:00" },
  { value: "full", label: RACE_DISTANCE_LABELS.full, placeholder: "e.g. 3:45:00" },
  { value: "pace", label: "Marathon pace (min/mile)", placeholder: "e.g. 8:30" },
]

export default function PaceGroupJoinModal({
  clubName,
  paceGroups,
  actionLabel,
  onConfirm,
  onClose,
}: {
  clubName: string
  paceGroups: PaceGroup[]
  actionLabel: string
  onConfirm: (result: PaceGroupJoinResult) => Promise<void> | void
  onClose: () => void
}) {
  const [mode, setMode] = useState<"time" | "manual">("time")
  const [distance, setDistance] = useState<Distance>("5k")
  const [timeInput, setTimeInput] = useState("")
  const [manualGroupId, setManualGroupId] = useState(paceGroups[0]?.id ?? "")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const distanceOption = DISTANCE_OPTIONS.find((d) => d.value === distance)!

  const confirmByTime = async () => {
    setError("")
    const isTrainingPace = distance === "pace"
    const parsed = isTrainingPace ? parsePace(timeInput) : parseRaceTime(timeInput, distance as RaceDistance)
    if (parsed === null) {
      setError(isTrainingPace ? "Enter a valid pace, like 8:30." : "That doesn't look right for this distance - double check the format.")
      return
    }

    const marathonPace = isTrainingPace ? parsed : raceTimeToMarathonPace(distance as RaceDistance, parsed)
    const matched = matchPaceGroup(marathonPace, paceGroups)
    if (!matched) {
      setError("No pace groups are set up for this klub yet.")
      return
    }

    setSubmitting(true)
    try {
      await onConfirm({
        paceGroupId: matched.id,
        selfReportedPace: marathonPace,
        raceDistance: distance,
        raceTimeSeconds: isTrainingPace ? null : parsed,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const confirmManual = async () => {
    if (!manualGroupId) return
    setSubmitting(true)
    try {
      await onConfirm({ paceGroupId: manualGroupId, selfReportedPace: null, raceDistance: null, raceTimeSeconds: null })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-sm max-h-[85vh] overflow-y-auto bg-[#1e2d12] border border-[#2e3d1a] rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5 animate-[fadeUp_0.25s_ease-out_forwards]">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-lg font-black text-white">What&rsquo;s your pace?</p>
            <p className="text-xs text-white/40 mt-0.5">{clubName}</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {mode === "time" ? (
          <>
            <p className="mt-4 text-xs text-white/60 leading-relaxed">
              Enter a recent race time or your marathon pace and we&rsquo;ll match you to this klub&rsquo;s closest pace group -
              groups here are defined by marathon pace, the pace you could hold over a full 26.2 miles.
            </p>

            <label className="block text-xs font-bold text-white/60 mt-4 mb-1">Distance</label>
            <Select
              value={distance}
              onChange={(e) => { setDistance(e.target.value as Distance); setError("") }}
              className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c5f135]/50"
            >
              {DISTANCE_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </Select>

            <label className="block text-xs font-bold text-white/60 mt-3 mb-1">
              {distance === "pace" ? "Marathon pace" : "Time"}
            </label>
            <input
              value={timeInput}
              onChange={(e) => { setTimeInput(e.target.value); setError("") }}
              placeholder={distanceOption.placeholder}
              className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#c5f135]/50"
            />

            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

            <button
              onClick={confirmByTime}
              disabled={submitting || !timeInput.trim()}
              className="mt-4 w-full py-3 rounded-2xl text-sm font-black bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "…" : actionLabel}
            </button>

            <button
              onClick={() => setMode("manual")}
              className="mt-3 w-full text-center text-[11px] text-white/40 hover:text-white/60 transition"
            >
              Don&rsquo;t have a race time - pick a pace group manually
            </button>
          </>
        ) : (
          <>
            <p className="mt-4 text-xs text-white/60 leading-relaxed">Pick whichever group fits you best - ranges shown are marathon pace.</p>

            <div className="flex flex-wrap gap-2 mt-3">
              {paceGroups.map((pg) => {
                const active = manualGroupId === pg.id
                return (
                  <button
                    key={pg.id}
                    type="button"
                    onClick={() => setManualGroupId(pg.id)}
                    className={`flex flex-col items-start px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      active
                        ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]"
                        : "bg-[#1a2110] text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"
                    }`}
                  >
                    <span>{pg.name}</span>
                    <span className={`text-[10px] font-normal mt-0.5 ${active ? "text-[#1a2110]/70" : "text-white/30"}`}>
                      {formatPaceRange(pg.pace_min, pg.pace_max)} pace
                    </span>
                    <span className={`text-[10px] font-bold mt-0.5 ${active ? "text-[#1a2110]" : "text-[#c5f135]"}`}>
                      {marathonTimeRangeLabel(pg.pace_min, pg.pace_max)}
                    </span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={confirmManual}
              disabled={submitting || !manualGroupId}
              className="mt-4 w-full py-3 rounded-2xl text-sm font-black bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "…" : actionLabel}
            </button>

            <button
              onClick={() => setMode("time")}
              className="mt-3 w-full text-center text-[11px] text-white/40 hover:text-white/60 transition"
            >
              ← Enter a race time instead
            </button>
          </>
        )}
      </div>
    </div>
  )
}
