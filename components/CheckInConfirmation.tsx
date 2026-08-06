"use client"

import { useEffect, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { isNativeApp } from "@/utils/platform"

const AUTO_DISMISS_MS = 2000

async function fireHaptic() {
  if (!isNativeApp()) return
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics")
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch { /* haptics unavailable — the popup still lands fine without it */ }
}

/** Unconditional "you're all checked in" confirmation — always shown first, independent of whether the passport/badge rollup succeeded. */
export default function CheckInConfirmation({ onDone }: { onDone: () => void }) {
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

  return (
    <div
      onClick={() => setDismissing(true)}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#111a0a]/95 backdrop-blur-sm transition-opacity duration-200 ${dismissing ? "opacity-0" : "opacity-100"}`}
    >
      <div className="relative flex items-center justify-center">
        <div className="absolute w-32 h-32 rounded-full bg-[#c5f135] animate-stamp-flash" />
        <div className="relative w-24 h-24 rounded-full flex items-center justify-center border-4 border-[#c5f135] bg-[#c5f135]/10 shadow-2xl shadow-black/50 animate-stamp-impact">
          <CheckCircle2 className="w-10 h-10 text-[#c5f135]" />
        </div>
      </div>
      <p className="animate-stamp-context mt-8 text-2xl font-black text-white">You&apos;re all checked in!</p>
    </div>
  )
}
