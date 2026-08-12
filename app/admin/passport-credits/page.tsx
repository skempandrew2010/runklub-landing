"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { CalendarCheck, Trophy, Zap, Clock, AlertTriangle } from "lucide-react"

type Tier = { tier: number; name: string; monthly_price_cents: number; credits_per_month: number }
type CheckinCost = { checkin_tier: "standard" | "premium"; credit_cost: number; club_payout_cents: number }
type Subscription = { id: string; tier: number; status: string; current_period_end: string | null }
type Batch = { id: string; credits_issued: number; credits_remaining: number; status: string; issued_at: string; expires_at: string }
type ClubRow = { id: string; name: string; passport_checkin_tier: "standard" | "premium"; passport_annual_price_cents: number | null }
type Checkin = { id: string; club_id: string; checkin_tier: string; credits_spent: number; payout_amount_cents: number; checked_in_at: string }

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

export default function PassportCreditsTestPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  const [tiers, setTiers] = useState<Tier[]>([])
  const [costs, setCosts] = useState<CheckinCost[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [clubs, setClubs] = useState<ClubRow[]>([])
  const [checkins, setCheckins] = useState<Checkin[]>([])

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [lastResult, setLastResult] = useState<{ clubName: string; creditsSpent: number; payoutCents: number } | null>(null)

  const clubById: Record<string, ClubRow> = Object.fromEntries(clubs.map((c) => [c.id, c]))
  const costByTier: Record<string, CheckinCost> = Object.fromEntries(costs.map((c) => [c.checkin_tier, c]))
  const creditBalance = batches
    .filter((b) => b.status === "active" && new Date(b.expires_at) > new Date())
    .reduce((sum, b) => sum + b.credits_remaining, 0)

  const refetchUserData = useCallback(async (uid: string) => {
    const [{ data: subData }, { data: batchData }, { data: checkinData }] = await Promise.all([
      supabase.from("passport_subscriptions").select("id, tier, status, current_period_end").eq("user_id", uid).eq("status", "active").maybeSingle(),
      supabase.from("passport_credit_batches").select("id, credits_issued, credits_remaining, status, issued_at, expires_at").eq("user_id", uid).order("issued_at", { ascending: true }),
      supabase.from("passport_checkins").select("id, club_id, checkin_tier, credits_spent, payout_amount_cents, checked_in_at").eq("user_id", uid).order("checked_in_at", { ascending: false }).limit(20),
    ])
    setSubscription(subData ?? null)
    setBatches(batchData ?? [])
    setCheckins(checkinData ?? [])
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      if (profile?.role !== "admin") { router.push("/"); return }

      setUserId(user.id)

      const [{ data: tiersData }, { data: costsData }, { data: clubsData }] = await Promise.all([
        supabase.from("passport_tiers").select("tier, name, monthly_price_cents, credits_per_month").order("tier"),
        supabase.from("passport_checkin_costs").select("checkin_tier, credit_cost, club_payout_cents"),
        supabase.from("clubs").select("id, name, passport_checkin_tier, passport_annual_price_cents").order("name").limit(50),
      ])
      setTiers(tiersData ?? [])
      setCosts(costsData ?? [])
      setClubs(clubsData ?? [])

      await refetchUserData(user.id)
      setLoading(false)
    }
    load()
  }, [router, refetchUserData])

  const createSubscription = async (tier: number) => {
    if (!userId) return
    setBusy(`sub-${tier}`)
    setError("")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/admin/passport/create-test-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ user_id: userId, tier }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Could not create test subscription"); return }
      await refetchUserData(userId)
    } finally {
      setBusy(null)
    }
  }

  const simulateIssuance = async () => {
    if (!userId) return
    setBusy("issue")
    setError("")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/admin/passport/issue-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ user_id: userId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Could not issue credits"); return }
      await refetchUserData(userId)
    } finally {
      setBusy(null)
    }
  }

  const simulateCheckin = async (club: ClubRow) => {
    if (!userId) return
    setBusy(`checkin-${club.id}`)
    setError("")
    setLastResult(null)
    try {
      const { data, error: rpcError } = await supabase.rpc("passport_redeem_checkin", { p_club_id: club.id })
      if (rpcError) { setError(rpcError.message); return }
      const cost = costByTier[club.passport_checkin_tier]
      setLastResult({ clubName: club.name, creditsSpent: cost?.credit_cost ?? 0, payoutCents: cost?.club_payout_cents ?? 0 })
      await refetchUserData(userId)
      void data
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">
        <div>
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">Admin prototype</p>
          <h1 className="text-xl font-black text-white">Passport Credits — Test Tools</h1>
          <p className="text-sm text-white/40 mt-1">Acts as your own signed-in account. No real Stripe calls happen here.</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {lastResult && (
          <div className="flex items-center gap-2 bg-[#c5f135]/10 border border-[#c5f135]/30 rounded-xl px-3 py-2.5">
            <Zap className="w-4 h-4 text-[#c5f135] shrink-0" />
            <p className="text-xs text-[#c5f135]">
              Checked in at <span className="font-bold">{lastResult.clubName}</span> — spent {lastResult.creditsSpent} credits, klub earns ${(lastResult.payoutCents / 100).toFixed(2)}.
            </p>
          </div>
        )}

        {/* SUBSCRIPTION */}
        <section>
          <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-2">Subscription</h2>
          <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl overflow-hidden">
            {subscription ? (
              <div className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-white">
                    {tiers.find((t) => t.tier === subscription.tier)?.name ?? `Tier ${subscription.tier}`}
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30">ACTIVE</span>
                </div>
                <p className="text-xs text-white/40 mt-1">{creditBalance} credits available</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {tiers.map((t) => (
                    <button
                      key={t.tier}
                      onClick={() => createSubscription(t.tier)}
                      disabled={busy === `sub-${t.tier}`}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full transition disabled:opacity-50 ${
                        t.tier === subscription.tier
                          ? "bg-[#c5f135] text-[#1a2110]"
                          : "bg-[#1a2110] text-white/60 border border-[#2e3d1a] hover:border-[#c5f135]/40"
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
                <button
                  onClick={simulateIssuance}
                  disabled={busy === "issue"}
                  className="mt-3 w-full text-xs font-black px-3 py-2 rounded-full bg-[#2e3d1a] text-[#c5f135] border border-[#3d5220] hover:bg-[#3d5220] transition disabled:opacity-50"
                >
                  {busy === "issue" ? "Issuing…" : "Simulate monthly credit issuance"}
                </button>
              </div>
            ) : (
              <div className="px-4 py-3.5">
                <p className="text-sm text-white/50 mb-3">No test subscription yet — pick a tier to create one.</p>
                <div className="grid grid-cols-2 gap-2">
                  {tiers.map((t) => (
                    <button
                      key={t.tier}
                      onClick={() => createSubscription(t.tier)}
                      disabled={busy === `sub-${t.tier}`}
                      className="bg-[#1a2110] border border-[#2e3d1a] hover:border-[#c5f135]/40 rounded-xl px-3 py-2.5 text-center transition disabled:opacity-50"
                    >
                      <p className="text-xs font-black text-white">{t.name}</p>
                      <p className="text-[10px] text-white/40">${(t.monthly_price_cents / 100).toFixed(0)}/mo · {t.credits_per_month} credits</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* CREDIT BATCHES */}
        <section>
          <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-2">Credit Batches</h2>
          <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">
            {batches.length === 0 ? (
              <p className="px-4 py-3.5 text-sm text-white/40">No batches issued yet.</p>
            ) : (
              batches.map((b) => {
                const days = daysUntil(b.expires_at)
                const expired = b.status === "expired" || days <= 0
                return (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                    <Clock className={`w-4 h-4 shrink-0 ${expired ? "text-white/20" : "text-[#c5f135]"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${expired ? "text-white/30 line-through" : "text-white"}`}>
                        {b.credits_remaining} / {b.credits_issued} credits
                      </p>
                      <p className="text-xs text-white/40">Issued {new Date(b.issued_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${expired ? "bg-white/5 text-white/30" : "bg-[#c5f135]/10 text-[#c5f135]"}`}>
                      {expired ? "EXPIRED" : `${days}d left`}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {/* KLUBS */}
        <section>
          <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-2">Klubs — Simulate Check-In</h2>
          <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">
            {clubs.length === 0 ? (
              <p className="px-4 py-3.5 text-sm text-white/40">No klubs found.</p>
            ) : (
              clubs.map((club) => {
                const cost = costByTier[club.passport_checkin_tier]
                const isPremium = club.passport_checkin_tier === "premium"
                return (
                  <div key={club.id} className="flex items-center gap-3 px-4 py-3">
                    {isPremium ? <Zap className="w-4 h-4 text-[#c5f135] shrink-0" /> : <Trophy className="w-4 h-4 text-white/30 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{club.name}</p>
                      <p className="text-xs text-white/40 capitalize">
                        {club.passport_checkin_tier} · {cost?.credit_cost ?? "—"} credits · klub earns ${((cost?.club_payout_cents ?? 0) / 100).toFixed(2)}
                      </p>
                    </div>
                    <button
                      onClick={() => simulateCheckin(club)}
                      disabled={busy === `checkin-${club.id}` || !subscription}
                      className="shrink-0 text-xs font-black px-3 py-1.5 rounded-full bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] transition disabled:opacity-50"
                    >
                      {busy === `checkin-${club.id}` ? "…" : "Check In"}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {/* RECENT CHECK-INS */}
        <section>
          <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-2">Recent Check-Ins</h2>
          <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">
            {checkins.length === 0 ? (
              <p className="px-4 py-3.5 text-sm text-white/40">No check-ins yet.</p>
            ) : (
              checkins.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <CalendarCheck className="w-4 h-4 text-[#c5f135]/70 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{clubById[c.club_id]?.name ?? "Klub"}</p>
                    <p className="text-xs text-white/40">
                      {c.credits_spent} credits · ${(c.payout_amount_cents / 100).toFixed(2)} payout · {new Date(c.checked_in_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
