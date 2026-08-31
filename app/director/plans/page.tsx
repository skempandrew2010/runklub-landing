"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { PLANS, PLAN_ORDER, CUSTOM_PRICING_MESSAGE, type PlanId, type BillingInterval } from "@/lib/plans"
import FadeIn from "@/components/FadeIn"
import { Select } from "@/components/Select"
import StripeCheckoutModal from "@/components/StripeCheckoutModal"

type ClubOption = { id: string; name: string; tier: PlanId | null; tier_expires_at: string | null; cancel_at_period_end: boolean }

// Stripe subscriptions stay "active" right up until the period actually
// ends, whether or not a cancellation is scheduled - cancel_at_period_end
// is the only thing that tells "renews on X" apart from "ends on X".
function billingStatusLabel(dateIso: string | null, cancelAtPeriodEnd: boolean) {
  if (!dateIso) return null
  const formatted = new Date(dateIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  return cancelAtPeriodEnd ? `Ends ${formatted}` : `Renews ${formatted}`
}

const TIER_RANK: Record<PlanId, number> = { free: 0, starter: 1, growth: 2, enterprise: 3 }

// Standalone intro page listing every plan (Free included) with its full
// feature list, so a director sees everything a plan unlocks before they
// click. Checkout stays instant/self-serve here -- no vetting call, unlike
// the Passport payout program's /director/passport page.
export default function DirectorPlansPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [clubs, setClubs] = useState<ClubOption[]>([])
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly")
  const [upgrading, setUpgrading] = useState(false)
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }
      const { data: myClubs } = await supabase
        .from("clubs")
        .select("id, name, tier, tier_expires_at, cancel_at_period_end")
        .eq("user_id", user.id)
        .order("name")

      if (!myClubs || myClubs.length === 0) { router.replace("/director"); return }
      setClubs(myClubs as ClubOption[])
      setSelectedClubId(myClubs[0].id)
      setLoading(false)
    }
    load()
  }, [router])

  const selectedClub = clubs.find((c) => c.id === selectedClubId)
  const currentTier: PlanId = (selectedClub?.tier as PlanId) ?? "free"

  const startCheckout = async (tier: "starter" | "growth" | "enterprise") => {
    if (!selectedClubId) return
    setUpgrading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push("/login"); return }
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ clubId: selectedClubId, tier, interval: billingInterval }),
    })
    const json = await res.json()
    if (res.ok && json.clientSecret) {
      setCheckoutClientSecret(json.clientSecret)
    } else {
      alert(json.error ?? "Could not start checkout")
    }
    setUpgrading(false)
  }

  if (loading || !selectedClub) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-4xl mx-auto px-5 sm:px-6 py-10">

        {clubs.length > 1 && (
          <div className="flex justify-end mb-4">
            <Select
              value={selectedClubId ?? ""}
              onChange={(e) => setSelectedClubId(e.target.value)}
              className="bg-[#1e2d12] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c5f135]/50"
            >
              {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        )}

        {/* Hero pitch - same scale/animation as /director/passport */}
        <FadeIn className="text-center mb-12">
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-3">Klub Plans</p>
          <h1 className="text-3xl sm:text-4xl font-black leading-tight text-white mb-5">
            Everything your klub gets,<br />plan by plan.
          </h1>
          <p className="text-white/50 text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
            Every klub starts on Free with real tools already included. Upgrade whenever you&apos;re ready for more: checkout is instant, and everything on the plan you pick is unlocked the moment you complete it.
          </p>

          <div className="inline-flex bg-[#1e2d12] border border-[#2e3d1a] rounded-full p-1 mt-8">
            {(["monthly", "yearly"] as const).map((iv) => (
              <button
                key={iv}
                onClick={() => setBillingInterval(iv)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition capitalize ${
                  billingInterval === iv ? "bg-[#c5f135] text-[#1a2110]" : "text-white/50 hover:text-white"
                }`}
              >
                {iv}
              </button>
            ))}
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {PLAN_ORDER.map((id, i) => {
            const plan = PLANS[id]
            const isCurrent = currentTier === id
            const isFree = id === "free"
            const canUpgradeTo = !isFree && TIER_RANK[id] > TIER_RANK[currentTier]
            const price = plan.price ? (billingInterval === "monthly" ? plan.price.monthly : plan.price.yearly) : null

            return (
              <FadeIn key={id} delay={i * 80}>
                <div className={`h-full flex flex-col rounded-2xl p-6 border ${isCurrent ? "bg-[#1a2d0a] border-[#c5f135]/40" : "bg-[#1e2d12] border-[#2e3d1a]"}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[11px] font-bold text-[#c5f135]/70 uppercase tracking-widest">{plan.name}</p>
                    {isCurrent && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110]">CURRENT PLAN</span>
                    )}
                  </div>
                  <p className="text-2xl font-black text-white mb-1">
                    {price != null ? `$${price}` : "$0"}
                    <span className="text-sm font-bold text-white/30"> {price != null ? (billingInterval === "monthly" ? "/mo" : "/yr") : "forever"}</span>
                  </p>
                  {plan.tagline && <p className="text-xs text-white/40 mb-4">{plan.tagline}</p>}
                  <ul className="space-y-2 flex-1 mb-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-white/70">
                        <Check className="w-3.5 h-3.5 text-[#c5f135] shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <div className="text-center py-3 rounded-xl border border-[#2e3d1a] text-white/30 text-sm font-bold">
                      You&apos;re on this plan
                      {!isFree && billingStatusLabel(selectedClub.tier_expires_at, selectedClub.cancel_at_period_end) && (
                        <p className="text-xs text-white/25 font-semibold mt-0.5">
                          {billingStatusLabel(selectedClub.tier_expires_at, selectedClub.cancel_at_period_end)}
                        </p>
                      )}
                    </div>
                  ) : isFree ? (
                    <div className="text-center py-3 rounded-xl border border-[#2e3d1a] text-white/30 text-sm font-bold">
                      Included with every klub
                    </div>
                  ) : canUpgradeTo ? (
                    <button
                      onClick={() => startCheckout(id as "starter" | "growth" | "enterprise")}
                      disabled={upgrading}
                      className="py-3 rounded-xl bg-[#c5f135] text-[#1a2110] text-sm font-black hover:bg-[#d4ff45] transition disabled:opacity-50"
                    >
                      {upgrading ? "Loading…" : `Upgrade to ${plan.name}`}
                    </button>
                  ) : (
                    <div className="text-center py-3 rounded-xl border border-[#2e3d1a] text-white/20 text-sm font-bold">
                      Included on your plan
                    </div>
                  )}
                </div>
              </FadeIn>
            )
          })}
        </div>
        <p className="text-center text-xs text-white/35 mt-8">Followers are always unlimited on every plan. {CUSTOM_PRICING_MESSAGE}</p>
      </div>

      {checkoutClientSecret && (
        <StripeCheckoutModal
          clientSecret={checkoutClientSecret}
          onClose={() => setCheckoutClientSecret(null)}
        />
      )}
    </div>
  )
}
