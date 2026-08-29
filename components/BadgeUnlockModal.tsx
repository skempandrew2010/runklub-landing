"use client"

import { useEffect, useState } from "react"
import { Award } from "lucide-react"
import { isNativeApp } from "@/utils/platform"
import { TIER_ICONS } from "@/components/TierCard"
import ModalPortal from "@/components/ModalPortal"

const AUTO_DISMISS_MS = 3400

async function fireHaptic() {
  if (!isNativeApp()) return
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics")
    await Haptics.impact({ style: ImpactStyle.Medium })
  } catch { /* haptics unavailable - visual/animation still lands fine without it */ }
}

export type UnlockedBadge = { slug: string; name: string; is_tier: boolean }

export default function BadgeUnlockModal({ badges, onDone }: { badges: UnlockedBadge[]; onDone: () => void }) {
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    fireHaptic()
    const t = setTimeout(() => setDismissing(true), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!dismissing) return
    const t = setTimeout(onDone, 200)
    return () => clearTimeout(t)
  }, [dismissing, onDone])

  if (badges.length === 0) return null

  return (
    <ModalPortal>
    <div
      onClick={() => setDismissing(true)}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#111a0a]/95 backdrop-blur-sm transition-opacity duration-200 ${dismissing ? "opacity-0" : "opacity-100"}`}
    >
      <div className="flex flex-col items-center gap-8 px-8 text-center max-w-sm max-h-[85vh] overflow-y-auto">
        {badges.map((b) => {
          const Icon = (b.is_tier && TIER_ICONS[b.slug]) || Award
          return (
            <div key={b.slug} className="flex flex-col items-center animate-stamp-context">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-28 h-28 rounded-full bg-[#c5f135] animate-stamp-flash" />
                <div className="relative w-24 h-24 rounded-full flex items-center justify-center border-4 border-[#c5f135] bg-gradient-to-br from-[#28380f] to-[#0e150a] shadow-2xl shadow-black/50 animate-stamp-impact">
                  <Icon className="w-10 h-10 text-[#c5f135]" />
                </div>
              </div>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-4">
                {b.is_tier ? "New Tier Unlocked" : "Badge Unlocked"}
              </p>
              <p className="text-2xl font-black text-white mt-1">{b.name}</p>
            </div>
          )
        })}
      </div>
    </div>
    </ModalPortal>
  )
}
