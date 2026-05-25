"use client"

import { useEffect, useState } from "react"
import { X, Share } from "lucide-react"

const DISMISSED_KEY = "runkub-pwa-dismissed"

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isInStandaloneMode() {
  return (window.navigator as any).standalone === true
}

export default function IOSInstallPrompt() {
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const alreadyDismissed = localStorage.getItem(DISMISSED_KEY)
    if (!alreadyDismissed && isIOS() && !isInStandaloneMode()) {
      const t = setTimeout(() => setVisible(true), 2500)
      return () => clearTimeout(t)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1")
    setVisible(false)
  }

  // Don't render anything server-side or before mount
  if (!mounted || !visible) return null

  return (
    <div
      className="fixed bottom-24 left-4 right-4 z-50 bg-[#1e2d12] border border-[#c5f135]/25 rounded-2xl shadow-2xl shadow-black/60"
      style={{ animation: "slideUp 0.3s ease forwards" }}
    >
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div className="w-11 h-11 rounded-xl bg-[#0D0D0D] border border-[#c5f135]/20 flex items-center justify-center shrink-0 overflow-hidden">
          <img src="/icons/icon-192.png" alt="RunKlub" className="w-full h-full object-cover" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white leading-snug">Add RunKlub to your Home Screen</p>
          <p className="text-xs text-white/50 mt-1 leading-relaxed">
            Tap{" "}
            <span className="inline-flex items-center gap-0.5 text-white/75 font-semibold">
              <Share className="w-3 h-3 inline" /> Share
            </span>
            {" "}then{" "}
            <span className="text-white/75 font-semibold">"Add to Home Screen"</span>
            {" "}for the full app experience.
          </p>
        </div>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          className="shrink-0 text-white/25 hover:text-white/60 transition mt-0.5"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Arrow pointing down toward the Safari share button */}
      <div className="flex justify-center pb-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#c5f135]/40 uppercase tracking-widest">
          <span>↓ tap share below</span>
        </div>
      </div>
    </div>
  )
}
