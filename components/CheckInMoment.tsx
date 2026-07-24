"use client"

import { useEffect, useMemo, useState } from "react"
import { Share2 } from "lucide-react"
import { isNativeApp } from "@/utils/platform"

const GRADIENTS = [
  "from-[#2d5a1b] to-[#111a0a]", "from-[#1b3d5a] to-[#111a0a]",
  "from-[#5a3d1b] to-[#111a0a]", "from-[#3d1b5a] to-[#111a0a]",
  "from-[#1b5a3d] to-[#111a0a]", "from-[#5a2b1b] to-[#111a0a]",
]
function getGradient(name: string) {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  return GRADIENTS[hash % GRADIENTS.length]
}
function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

const AUTO_DISMISS_MS = 2800
const AUTO_DISMISS_WITH_SHARE_MS = 6000

async function fireHaptic() {
  if (!isNativeApp()) return
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics")
    await Haptics.impact({ style: ImpactStyle.Medium })
  } catch { /* haptics unavailable — visual/animation still lands fine without it */ }
}

async function shareImage(url: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const file = new File([blob], "runklub-stamp.png", { type: "image/png" })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "RunKlub" })
      return
    }
  } catch { /* fall through to opening the image directly */ }
  window.open(url, "_blank")
}

export type CheckInMomentProps = {
  clubName: string
  clubStampUrl: string | null
  isFirstTime: boolean
  clubCount: number
  totalStamps: number
  justStampedCityComplete: boolean
  justStampedCityName: string | null
  nearestIncomplete: { cityName: string; remaining: number } | null
  shareCardUrl: string | null
  onDone: () => void
}

export default function CheckInMoment({
  clubName,
  clubStampUrl,
  isFirstTime,
  clubCount,
  totalStamps,
  justStampedCityComplete,
  justStampedCityName,
  nearestIncomplete,
  shareCardUrl,
  onDone,
}: CheckInMomentProps) {
  // Real stamps never land perfectly straight — pick the imperfection once per moment.
  const rotation = useMemo(() => Math.round(Math.random() * 12 - 6), [])
  const [dismissing, setDismissing] = useState(false)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    if (isFirstTime) fireHaptic()
    const t = setTimeout(() => setDismissing(true), shareCardUrl ? AUTO_DISMISS_WITH_SHARE_MS : AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [isFirstTime, shareCardUrl])

  useEffect(() => {
    if (!dismissing) return
    const t = setTimeout(onDone, 200)
    return () => clearTimeout(t)
  }, [dismissing, onDone])

  const gradient = getGradient(clubName)
  const initials = initialsOf(clubName)

  return (
    <div
      onClick={() => setDismissing(true)}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#111a0a]/95 backdrop-blur-sm transition-opacity duration-200 ${dismissing ? "opacity-0" : "opacity-100"}`}
    >
      <div className="relative flex items-center justify-center">
        {isFirstTime && (
          <div className="absolute w-40 h-40 rounded-full bg-[#c5f135] animate-stamp-flash" />
        )}
        <div
          className={`relative rounded-full overflow-hidden flex items-center justify-center border-4 shadow-2xl shadow-black/50 bg-gradient-to-br ${gradient} ${
            isFirstTime ? "w-32 h-32 border-[#c5f135] animate-stamp-impact" : "w-20 h-20 border-[#3d5220]"
          }`}
          style={{ "--stamp-rot": `${rotation}deg` } as React.CSSProperties}
        >
          {clubStampUrl ? (
            <img src={clubStampUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className={`font-black text-white/90 ${isFirstTime ? "text-4xl" : "text-2xl"}`}>{initials}</span>
          )}
        </div>
      </div>

      <div className="animate-stamp-context mt-8 px-8 text-center max-w-sm">
        {isFirstTime ? (
          <>
            <p className="text-2xl font-black text-white">Stamp #{totalStamps}</p>
            <p className="text-sm text-white/50 mt-1">{clubName}</p>
            {justStampedCityComplete && justStampedCityName ? (
              <p className="text-base font-bold text-[#c5f135] mt-4">
                You just completed {justStampedCityName}! 🎉
              </p>
            ) : nearestIncomplete ? (
              <p className="text-base text-white/70 mt-4">
                You&apos;re <span className="text-[#c5f135] font-bold">{nearestIncomplete.remaining}</span> away from completing{" "}
                <span className="font-bold text-white">{nearestIncomplete.cityName}</span>.
              </p>
            ) : (
              <p className="text-base text-white/70 mt-4">You&apos;ve stamped every klub in your Passport.</p>
            )}
          </>
        ) : (
          <>
            <p className="text-lg font-bold text-white">Visit #{clubCount}</p>
            <p className="text-sm text-white/50 mt-1">{clubName}</p>
          </>
        )}

        {shareCardUrl && (
          <button
            onClick={async (e) => {
              e.stopPropagation()
              setSharing(true)
              await shareImage(shareCardUrl)
              setSharing(false)
            }}
            disabled={sharing}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#c5f135] text-[#1a2110] text-sm font-black hover:bg-[#d4ff45] transition disabled:opacity-50"
          >
            <Share2 className="w-4 h-4" />
            {sharing ? "…" : "Share"}
          </button>
        )}
      </div>
    </div>
  )
}
