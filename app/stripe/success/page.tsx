"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { Suspense } from "react"
import { ShieldCheck, Zap, ArrowRight } from "lucide-react"
import { PLANS, type PlanId } from "@/lib/plans"

const TIER_CONTENT: Record<string, { icon: "zap" | "shield"; features: string[] }> = {
  starter: {
    icon: "shield",
    features: [
      "Verified badge on your klub profile",
      "Weekly email reminder of the week's runs",
      "One-tap Instagram post from a ready-made template",
      "Optionally charge members to join your klub",
      "Access to race benefits & sponsor perks",
    ],
  },
  growth: {
    icon: "zap",
    features: [
      "Everything in Starter",
      "One branch with unlimited locations",
      "Klub update emails 3× a week",
      "Up to 10 coaches",
      "Priority verified placement in search",
      "Free sponsor banners",
    ],
  },
  enterprise: {
    icon: "zap",
    features: [
      "Everything in Growth",
      "Unlimited branches",
      "Daily email updates for members",
      "Unlimited coaches",
      "First klub shown in city search",
      "Priority in the sponsor & race network",
    ],
  },
}

function SuccessContent() {
  const params = useSearchParams()
  const router = useRouter()
  const clubId = params.get("club_id")
  const tier = params.get("tier") as PlanId | null

  const content = tier ? TIER_CONTENT[tier] : null
  const planName = tier ? PLANS[tier]?.name ?? tier : "your plan"
  const useZap = content?.icon === "zap"

  return (
    <div className="min-h-screen bg-[#1a2110] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-[#c5f135]/10 border-2 border-[#c5f135]/40 flex items-center justify-center mb-6">
        {useZap
          ? <Zap className="w-9 h-9 text-[#c5f135]" />
          : <ShieldCheck className="w-9 h-9 text-[#c5f135]" />
        }
      </div>

      <h1 className="text-3xl font-black text-white mb-2">
        Welcome to {planName}!
      </h1>
      <p className="text-sm text-white/50 max-w-xs leading-relaxed mb-8">
        Your klub is now on the {planName} plan. Everything below is active and ready to go.
      </p>

      <div className="w-full max-w-xs bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 mb-8 text-left">
        <p className="text-[10px] font-bold text-white/30 tracking-widest uppercase mb-3">
          {planName} Features Active
        </p>
        <ul className="space-y-2">
          {(content?.features ?? ["Your new features are now active."]).map((f) => (
            <li key={f} className="flex items-center gap-2.5 text-xs text-white/65">
              <div className="w-1.5 h-1.5 rounded-full bg-[#c5f135] shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={() => router.push(clubId ? `/director` : "/director")}
        className="flex items-center gap-2 px-6 py-3 bg-[#c5f135] text-[#1a2110] font-black text-sm rounded-full hover:bg-[#d4ff45] transition"
      >
        Go to Klub Dashboard
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
