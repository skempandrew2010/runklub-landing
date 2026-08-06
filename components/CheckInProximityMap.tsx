"use client"

import { getDistanceMiles } from "@/utils/distance"
import type { CheckinTarget } from "@/lib/checkinGeofence"

function formatDistance(miles: number) {
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`
  return `${miles.toFixed(2)} mi`
}

function staticMapUrl(target: CheckinTarget, position: { lat: number; lng: number } | null) {
  const pins = [`pin-l+c5f135(${target.lng},${target.lat})`]
  if (position) pins.push(`pin-l+2563eb(${position.lng},${position.lat})`)
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/${pins.join(",")}/auto/400x220@2x?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
}

/** Small static map showing the run location vs. the member's current position, with a live distance readout. */
export default function CheckInProximityMap({
  target,
  position,
  positionError,
}: {
  target: CheckinTarget | null
  position: { lat: number; lng: number } | null
  positionError: string | null
}) {
  if (!target) return null

  const distanceMiles = position ? getDistanceMiles(position.lat, position.lng, target.lat, target.lng) : null
  const inRange = distanceMiles != null && distanceMiles <= target.radiusMiles

  return (
    <div className="mt-4 rounded-2xl overflow-hidden border border-[#2e3d1a]">
      <img
        src={staticMapUrl(target, position)}
        alt="Map showing the run location and your current position"
        className="w-full h-36 object-cover bg-[#1a2110]"
      />
      <div className="flex items-center justify-between px-3 py-2 bg-[#1a2110]">
        <div className="flex items-center gap-3 text-[10px] font-bold text-white/50">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#c5f135]" /> Run</span>
          {position && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#2563eb]" /> You</span>}
        </div>
        {distanceMiles != null ? (
          <span className={`text-xs font-black ${inRange ? "text-[#c5f135]" : "text-amber-400"}`}>
            {formatDistance(distanceMiles)} away
          </span>
        ) : positionError ? (
          <span className="text-[10px] text-white/40">{positionError}</span>
        ) : (
          <span className="text-[10px] text-white/40">Locating you…</span>
        )}
      </div>
    </div>
  )
}
