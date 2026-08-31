"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Lock } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  getUserTierProgress,
  getTierDefinitions,
  getTierLeaderboard,
  type TierProgress,
  type TierDefinition,
  type TierLeaderboardRow,
} from "@/lib/checkins"
import { TIER_ICONS } from "@/components/TierCard"
import { hasPassportAccess } from "@/lib/passportConfig"

const RANK_LIMIT = 20

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

function LadderRow({ tier, earnedRank }: { tier: TierDefinition; earnedRank: number | null }) {
  const Icon = TIER_ICONS[tier.slug]
  const isCurrent = earnedRank !== null && tier.tier_rank === earnedRank
  const isEarned = earnedRank !== null && tier.tier_rank <= earnedRank
  const isLocked = !isEarned

  return (
    <div
      className={`flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border ${
        isCurrent
          ? "bg-[#c5f135]/10 border-[#c5f135]/50"
          : isEarned
            ? "bg-[#1e2d12] border-[#2e3d1a]"
            : "bg-[#1e2d12]/50 border-[#2e3d1a]/60"
      }`}
    >
      <div
        className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 border-2 ${
          isLocked ? "border-white/10 bg-white/5" : "border-[#c5f135]/40 bg-[#c5f135]/10"
        }`}
      >
        {Icon && <Icon className={`w-5 h-5 ${isLocked ? "text-white/20" : "text-[#c5f135]"}`} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-black leading-tight ${isLocked ? "text-white/40" : "text-white"}`}>
          {tier.name}
          {isCurrent && <span className="text-[#c5f135] font-black"> · You</span>}
        </p>
        <p className="text-xs text-white/40 mt-0.5">{tier.description}</p>
      </div>
      {isEarned ? (
        <Check className="w-4 h-4 text-[#c5f135] shrink-0" />
      ) : (
        <Lock className="w-3.5 h-3.5 text-white/20 shrink-0" />
      )}
    </div>
  )
}

function RankingRow({ row, isYou }: { row: TierLeaderboardRow; isYou: boolean }) {
  const Icon = TIER_ICONS[row.tier_slug]
  const name = row.display_name || "Runner"
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${isYou ? "bg-[#c5f135]/5 border border-[#c5f135]/25" : ""}`}>
      <div className="w-7 h-7 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0">
        <span className="text-xs font-bold text-white/40">{row.rank}</span>
      </div>
      <div className="w-9 h-9 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0 overflow-hidden">
        {row.avatar_url ? (
          <img src={row.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs font-bold text-[#c5f135]">{initialsOf(name)}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">
          {name}
          {isYou && <span className="text-[#c5f135] font-black"> (You)</span>}
        </p>
        <p className="text-[10px] text-white/40 mt-0.5">{row.cities_total} cities · {row.states_total} states</p>
      </div>
      <span className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full bg-[#c5f135]/10 border border-[#c5f135]/30">
        {Icon && <Icon className="w-3 h-3 text-[#c5f135]" />}
        <span className="text-[10px] font-bold text-[#c5f135]">{row.tier_name}</span>
      </span>
    </div>
  )
}

export default function TierRankingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [progress, setProgress] = useState<TierProgress | null>(null)
  const [tiers, setTiers] = useState<TierDefinition[]>([])
  const [ranking, setRanking] = useState<TierLeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)
      if (!user) { setLoading(false); return }
      if (!hasPassportAccess(user.email)) { router.replace("/passport"); return }

      const { data: sub } = await supabase
        .from("passport_subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle()
      if (!sub) { router.replace("/passport/credits"); return }

      const [progressData, tierDefs, rankingData] = await Promise.all([
        getUserTierProgress(),
        getTierDefinitions(),
        getTierLeaderboard(),
      ])
      setProgress(progressData)
      setTiers(tierDefs)
      setRanking(rankingData)
      setLoading(false)
    }
    load()
  }, [])

  const earnedRank = progress?.current_tier_slug
    ? tiers.find((t) => t.slug === progress.current_tier_slug)?.tier_rank ?? null
    : null

  const visible = ranking.slice(0, RANK_LIMIT)
  const own = ranking.find((r) => r.user_id === userId)
  const ownVisible = own ? own.rank <= RANK_LIMIT : false

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-lg mx-auto px-5 py-6">
        <Link href="/passport" className="inline-flex items-center gap-1.5 text-white/40 hover:text-white text-sm font-semibold mb-6 transition">
          <ArrowLeft className="w-4 h-4" /> Passport
        </Link>

        <h1 className="text-xl font-black text-white leading-tight mb-1">Tier Rankings</h1>
        <p className="text-xs text-white/40 mb-6">See where you stand and what's next.</p>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
          </div>
        ) : !userId ? (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-6 text-center">
            <p className="text-white font-bold text-sm mb-1">Sign in to see your tier</p>
            <button onClick={() => router.push("/login")} className="mt-3 px-6 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition">
              Log In
            </button>
          </div>
        ) : (
          <>
            <div>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 px-1">The Ladder</p>
              <div className="space-y-2 mb-8">
                {tiers.map((tier) => (
                  <LadderRow key={tier.slug} tier={tier} earnedRank={earnedRank} />
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 px-1">Global Ranking</p>
              {ranking.length === 0 ? (
                <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
                  <p className="text-white/40 text-sm">No one's earned a tier yet — be the first!</p>
                </div>
              ) : (
                <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-2 space-y-1">
                  {visible.map((row) => (
                    <RankingRow key={row.user_id} row={row} isYou={row.user_id === userId} />
                  ))}
                  {own && !ownVisible && (
                    <>
                      <div className="h-px bg-[#2e3d1a] my-1" />
                      <RankingRow row={own} isYou />
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
