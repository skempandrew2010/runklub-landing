"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import type { ComponentType } from "react"
import { Flame, PartyPopper, Trophy } from "lucide-react"
import { getHubChallengeNotifications, type HubNotification } from "@/lib/challenges"

const ICONS: Record<HubNotification["kind"], ComponentType<{ className?: string }>> = {
  streak_risk: Flame,
  comeback: PartyPopper,
  completed: Trophy,
}

/** The Hub tab's notification spot: lapsing streaks, comeback welcome-backs, recent challenge completions. */
export default function ChallengeHubBanner({ userId }: { userId: string | null }) {
  const [notifications, setNotifications] = useState<HubNotification[]>([])

  useEffect(() => {
    if (!userId) return
    getHubChallengeNotifications().then(setNotifications)
  }, [userId])

  if (notifications.length === 0) return null

  return (
    <div className="space-y-2">
      {notifications.map((n) => {
        const Icon = ICONS[n.kind]
        return (
          <Link
            key={n.id}
            href="/challenges"
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#c5f135]/[0.06] border border-[#c5f135]/25 hover:border-[#c5f135]/50 transition"
          >
            <div className="w-8 h-8 rounded-full bg-[#c5f135]/15 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-[#c5f135]" />
            </div>
            <p className="text-sm font-semibold text-white flex-1">{n.message}</p>
          </Link>
        )
      })}
    </div>
  )
}
