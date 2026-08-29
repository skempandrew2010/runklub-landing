"use client"

import { useEffect, useMemo, useState } from "react"
import { Award } from "lucide-react"
import { CHALLENGE_ICONS } from "@/components/ChallengeCard"
import ModalPortal from "@/components/ModalPortal"

export type NewlyCompletedChallenge = {
  slug: string
  name: string
  description: string | null
  current?: number
  target?: number
  metricLabel?: string
}

const AUTO_DISMISS_MS = 3200

/** Queues through one or more newly-completed missions, each landing like a passport stamp. */
export default function ChallengeCompleteMoment({
  challenges,
  onDone,
}: {
  challenges: NewlyCompletedChallenge[]
  onDone: () => void
}) {
  const [index, setIndex] = useState(0)
  const [dismissing, setDismissing] = useState(false)
  const current = challenges[index]

  // Real stamps never land perfectly straight - pick the imperfection once per moment.
  const rotation = useMemo(() => Math.round(Math.random() * 12 - 6), [index])

  useEffect(() => {
    setDismissing(false)
    const t = setTimeout(() => setDismissing(true), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [index])

  useEffect(() => {
    if (!dismissing) return
    const t = setTimeout(() => {
      if (index + 1 < challenges.length) setIndex((i) => i + 1)
      else onDone()
    }, 200)
    return () => clearTimeout(t)
  }, [dismissing, index, challenges.length, onDone])

  if (!current) return null
  const Icon = CHALLENGE_ICONS[current.slug] || Award

  return (
    <ModalPortal>
    <div
      onClick={() => setDismissing(true)}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#111a0a]/95 backdrop-blur-sm transition-opacity duration-200 ${dismissing ? "opacity-0" : "opacity-100"}`}
    >
      <div className="relative flex items-center justify-center">
        <div className="absolute w-36 h-36 rounded-full bg-[#c5f135] animate-stamp-flash" />
        <div
          className="relative w-28 h-28 rounded-full flex items-center justify-center border-4 border-[#c5f135] bg-[#c5f135]/10 shadow-2xl shadow-black/50 animate-stamp-impact"
          style={{ "--stamp-rot": `${rotation}deg` } as React.CSSProperties}
        >
          <div className="absolute inset-2 rounded-full border border-dashed border-[#c5f135]/50" />
          <Icon className="w-10 h-10 text-[#c5f135] relative" />
        </div>
      </div>

      <div className="animate-stamp-context mt-8 px-8 text-center max-w-sm">
        <p className="text-xs font-black text-[#c5f135] uppercase tracking-widest">Mission Complete</p>
        <p className="text-2xl font-black text-white mt-1">{current.name}</p>
        {current.description && <p className="text-sm text-white/50 mt-2">{current.description}</p>}
        {!!current.target && !!current.metricLabel && (
          <p className="text-sm font-bold text-[#c5f135] mt-3">
            {current.current} of {current.target} {current.metricLabel} - nailed it 🎉
          </p>
        )}
      </div>
    </div>
    </ModalPortal>
  )
}
