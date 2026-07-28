"use client"

import { useEffect, useState } from "react"
import { Stamp, Lock } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { getChallengesWithProgress, type ChallengeWithProgress } from "@/lib/challenges"
import ChallengeCard from "@/components/ChallengeCard"
import KlubShowdownLeaderboard from "@/components/KlubShowdownLeaderboard"
import LoginModal from "@/components/LoginModal"

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-5 rounded-full bg-[#c5f135] shrink-0" />
      <div>
        <h2 className="text-sm font-black text-white tracking-tight leading-none">{title}</h2>
        {sub && <p className="text-[10px] text-white/35 mt-0.5">{sub}</p>}
      </div>
      <div className="flex-1 h-px bg-[#2e3d1a]" />
    </div>
  )
}

export default function ChallengesPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [challenges, setChallenges] = useState<ChallengeWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)
      const data = await getChallengesWithProgress()
      setChallenges(data)
      setLoading(false)
    }
    load()
  }, [])

  const active = challenges.filter((c) => !c.completed)
  const completed = challenges.filter((c) => c.completed)
  const gated = !loading && !userId

  return (
    <div className="min-h-screen bg-[#1a2110]">
      <div className="bg-[#1e2d12] border-b border-[#2e3d1a]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#c5f135]/10 border border-[#c5f135]/25 flex items-center justify-center shrink-0">
            <Stamp className="w-4 h-4 text-[#c5f135]" />
          </div>
          <div>
            <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">Engagement</p>
            <h1 className="text-3xl font-black text-white leading-tight">Missions</h1>
            <p className="text-sm text-white/40 mt-1.5">
              {loading ? "Streaks, social runs, and klub-vs-klub bragging rights." : `${challenges.length} missions to take on.`}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 relative">
        {loading && (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
          </div>
        )}

        {!loading && (
          <div className="space-y-10">
            <section>
              <SectionHeader title="In Progress" />
              <div className={gated ? "blur-sm pointer-events-none select-none" : ""}>
                {active.length === 0 ? (
                  <div className="bg-[#1e2d12] rounded-2xl p-6 text-center border border-[#2e3d1a]">
                    <p className="text-white/50 text-sm font-medium">You&apos;ve completed every active mission. 🎉</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {active.map((c) => (
                      <ChallengeCard key={c.id} challenge={c} />
                    ))}
                  </div>
                )}
              </div>
            </section>

            {completed.length > 0 && (
              <section>
                <SectionHeader title="Completed" />
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${gated ? "blur-sm pointer-events-none select-none" : ""}`}>
                  {completed.map((c) => (
                    <ChallengeCard key={c.id} challenge={c} />
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionHeader title="Klub Showdown" sub="Monthly klub-vs-klub leaderboard" />
              <div className={gated ? "blur-sm pointer-events-none select-none" : ""}>
                <KlubShowdownLeaderboard />
              </div>
            </section>
          </div>
        )}

        {gated && (
          <div className="fixed inset-x-0 z-40 flex justify-center px-5 pointer-events-none" style={{ top: 'calc(var(--navbar-h) + 96px)' }}>
            <div className="max-w-sm w-full bg-[#1e2d12] border border-[#c5f135]/25 rounded-2xl p-6 text-center shadow-2xl shadow-black/60 pointer-events-auto">
              <div className="w-11 h-11 rounded-full bg-[#c5f135]/10 border border-[#c5f135]/25 flex items-center justify-center mx-auto mb-3">
                <Lock className="w-5 h-5 text-[#c5f135]" />
              </div>
              <p className="text-white font-black text-base">Sign up to track your missions</p>
              <p className="text-white/40 text-xs mt-1.5 leading-relaxed">
                Streaks, badges, and klub showdown standings — create a free account to start earning them.
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="mt-4 w-full px-6 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition"
              >
                Sign Up — It&apos;s Free
              </button>
            </div>
          </div>
        )}

        {showAuthModal && (
          <LoginModal onClose={() => setShowAuthModal(false)} onSuccess={() => setShowAuthModal(false)} />
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
