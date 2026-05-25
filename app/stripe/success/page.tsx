"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { Suspense } from "react"
import { ShieldCheck, Zap, ArrowRight } from "lucide-react"

function SuccessContent() {
  const params = useSearchParams()
  const router = useRouter()
  const clubId = params.get("club_id")
  const tier = params.get("tier") as "verified" | "pro" | null

  const isVerified = tier === "verified"
  const isPro = tier === "pro"

  return (
    <div className="min-h-screen bg-[#1a2110] flex flex-col items-center justify-center px-6 text-center">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-[#c5f135]/10 border-2 border-[#c5f135]/40 flex items-center justify-center mb-6">
        {isPro
          ? <Zap className="w-9 h-9 text-[#c5f135]" />
          : <ShieldCheck className="w-9 h-9 text-[#c5f135]" />
        }
      </div>

      <h1 className="text-3xl font-black text-white mb-2">
        {isPro ? "Welcome to Pro!" : "Klub Verified!"}
      </h1>
      <p className="text-sm text-white/50 max-w-xs leading-relaxed mb-8">
        {isPro
          ? "Your klub is now on the Pro plan. Push notifications, analytics, and featured placement are all active."
          : "Your verified badge is live. Your klub now appears with priority placement and you have access to RSVP data. Your subscription renews annually."
        }
      </p>

      {/* What's unlocked */}
      <div className="w-full max-w-xs bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 mb-8 text-left">
        <p className="text-[10px] font-bold text-white/30 tracking-widest uppercase mb-3">
          {isPro ? "Pro Features Active" : "Verified Features Active"}
        </p>
        <ul className="space-y-2">
          {(isPro ? [
            "Everything in Verified",
            "Push notifications to followers",
            "Analytics dashboard",
            "Multiple club admins",
            "Featured placement at events",
          ] : [
            "Verified badge on map",
            "Priority in search results",
            "Custom profile bio & photos",
            "RSVP data access",
          ]).map((f) => (
            <li key={f} className="flex items-center gap-2.5 text-xs text-white/65">
              <div className="w-1.5 h-1.5 rounded-full bg-[#c5f135] shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={() => router.push(clubId ? `/dashboard/${clubId}` : "/director")}
        className="flex items-center gap-2 px-6 py-3 bg-[#c5f135] text-[#1a2110] font-black text-sm rounded-full hover:bg-[#d4ff45] transition"
      >
        Go to Club Dashboard
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
