"use client"

import { Flame, Sun, UserPlus, Users, Compass, Sunrise, Award, RotateCcw } from "lucide-react"
import type { ComponentType } from "react"
import type { ChallengeWithProgress } from "@/lib/challenges"

export const CHALLENGE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "never-miss-4": Flame,
  "never-miss-8": Flame,
  "never-miss-12": Flame,
  "weekend-warrior": Sun,
  "bring-a-friend": UserPlus,
  "klub-crew": Users,
  "try-3-klubs": Compass,
  "morning-person": Sunrise,
  "consistency-club": Award,
  comeback: RotateCcw,
}

/** Real ink stamps never land perfectly straight — pick a small, consistent tilt per mission. */
function stampRotation(slug: string): number {
  const hash = slug.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  return (hash % 13) - 6 // -6deg .. 6deg
}

export default function ChallengeCard({ challenge }: { challenge: ChallengeWithProgress }) {
  const Icon = CHALLENGE_ICONS[challenge.slug] || Award
  const pct = challenge.target > 0 ? Math.min(100, Math.round((challenge.current / challenge.target) * 100)) : 0
  const showBar = challenge.metricLabel !== ""
  const rotation = stampRotation(challenge.slug)

  return (
    <div
      className={`rounded-2xl p-4 border-2 border-dashed transition ${
        challenge.completed ? "bg-[#c5f135]/5 border-[#c5f135]/25" : "bg-[#1e2d12] border-[#2e3d1a]"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Postmark-style badge: a blank dashed ring waiting for a stamp, or an inked, slightly-tilted stamp once earned. */}
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 relative"
          style={challenge.completed ? { transform: `rotate(${rotation}deg)` } : undefined}
        >
          <div
            className={`absolute inset-0 rounded-full ${
              challenge.completed ? "border-2 border-[#c5f135]" : "border-2 border-dashed border-[#3d5220]"
            }`}
          />
          <div
            className={`absolute inset-[3px] rounded-full ${
              challenge.completed ? "border border-[#c5f135]/50 bg-[#c5f135]/10" : "bg-[#0e150a]"
            }`}
          />
          <Icon className={`w-4 h-4 relative ${challenge.completed ? "text-[#c5f135]" : "text-white/30"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white leading-tight">{challenge.name}</p>
          {challenge.description && (
            <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{challenge.description}</p>
          )}
        </div>
      </div>

      {challenge.completed ? (
        <p className="mt-3 text-[10px] font-black text-[#c5f135] uppercase tracking-widest">Stamped ✓</p>
      ) : showBar ? (
        <div className="mt-3">
          <p className="text-[10px] text-white/40 mb-1.5">
            <span className="text-[#c5f135] font-bold">{challenge.current}</span> of{" "}
            <span className="font-bold text-white">{challenge.target}</span> {challenge.metricLabel}
          </p>
          <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
            <div className="h-full bg-[#c5f135] rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
