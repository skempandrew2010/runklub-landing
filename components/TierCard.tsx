"use client"

import Link from "next/link"
import { Stamp, MapPin, Compass, Plane, Map as MapIcon, Globe, Share2, ChevronRight } from "lucide-react"
import type { ComponentType } from "react"
import type { TierProgress } from "@/lib/checkins"

export const TIER_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  local: Stamp,
  regular: MapPin,
  explorer: Compass,
  road_warrior: Plane,
  cross_country: MapIcon,
  passport_holder: Globe,
}

export default function TierCard({ progress, onShare }: { progress: TierProgress; onShare?: () => void }) {
  const CurrentIcon = (progress.current_tier_slug && TIER_ICONS[progress.current_tier_slug]) || Stamp
  const pct =
    progress.progress_target && progress.progress_current != null
      ? Math.min(100, Math.round((progress.progress_current / progress.progress_target) * 100))
      : 100

  return (
    <div className="relative rounded-2xl p-5 mb-6 border border-[#c5f135]/25 bg-gradient-to-br from-[#28380f] via-[#1a2110] to-[#0e150a] overflow-hidden">
      <div className="flex items-center gap-4">
        <Link href="/passport/tiers" className="flex items-center gap-4 flex-1 min-w-0 group">
          <div className="w-14 h-14 rounded-full flex items-center justify-center bg-[#c5f135]/10 border-2 border-[#c5f135]/40 shrink-0">
            <CurrentIcon className="w-6 h-6 text-[#c5f135]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Current Tier</p>
            <p className="text-xl font-black text-white leading-tight truncate flex items-center gap-1 group-hover:text-[#c5f135] transition">
              {progress.current_tier ?? "Unranked"}
              <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-[#c5f135] transition shrink-0" />
            </p>
          </div>
        </Link>
        {onShare && (
          <button
            onClick={onShare}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-white/60 text-xs font-bold hover:bg-white/10 hover:text-white transition"
          >
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>
        )}
      </div>

      {progress.next_tier ? (
        <div className="mt-4">
          <p className="text-xs text-white/50 mb-1.5">
            <span className="text-[#c5f135] font-bold">{progress.progress_current}</span> of{" "}
            <span className="font-bold text-white">{progress.progress_target}</span> {progress.progress_metric} to{" "}
            <span className="font-bold text-white">{progress.next_tier}</span>
          </p>
          <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
            <div className="h-full bg-[#c5f135] rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-[#c5f135] font-bold">Top tier reached — you&apos;ve seen it all. 🌍</p>
      )}
    </div>
  )
}
