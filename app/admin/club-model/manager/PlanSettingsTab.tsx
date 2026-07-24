"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { setTestTier } from "@/lib/clubModel/api"
import { PLANS, PLAN_ORDER, LIFETIME_VERIFICATION_PRICE, type PlanId, type BillingInterval } from "@/lib/plans"
import { Card, SectionTitle, Button } from "./ui"

function yearlySavingsPct(monthly: number, yearly: number) {
  const fullYear = monthly * 12
  return Math.round(((fullYear - yearly) / fullYear) * 100)
}

export default function PlanSettingsTab({ clubId }: { clubId: string }) {
  const [tier, setTier] = useState<PlanId | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState<PlanId | null>(null)
  const [interval, setInterval] = useState<BillingInterval>("monthly")

  const load = async () => {
    const { data } = await supabase.from("clubs").select("tier").eq("id", clubId).single()
    setTier((data?.tier as PlanId) ?? "free")
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const switchTo = async (id: PlanId) => {
    if (id === tier) return
    setSwitching(id)
    try {
      await setTestTier(id)
      await load()
    } finally {
      setSwitching(null)
    }
  }

  if (loading) return <p className="text-white/60 text-sm">Loading…</p>

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle>Test this klub&rsquo;s plan</SectionTitle>
        <p className="text-sm text-white/50 mb-4">
          This is a test-only switch for this one prototype klub — it changes what you can do in the rest of this
          dashboard instantly, so you can walk through each plan&rsquo;s limits. Switching to Free will lock you out of
          this dashboard (refresh the page to see it take effect).
        </p>

        <div className="flex justify-center mb-5">
          <div className="inline-flex bg-[#1a2110] border border-[#2e3d1a] rounded-full p-1">
            <button
              onClick={() => setInterval("monthly")}
              className={`px-4 py-1.5 rounded-full text-sm font-bold transition ${
                interval === "monthly" ? "bg-[#c5f135] text-[#1a2110]" : "text-white/50 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval("yearly")}
              className={`px-4 py-1.5 rounded-full text-sm font-bold transition ${
                interval === "yearly" ? "bg-[#c5f135] text-[#1a2110]" : "text-white/50 hover:text-white"
              }`}
            >
              Yearly
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id]
            const isCurrent = tier === id
            const highlighted = id === "growth"
            const savingsPct = plan.price ? yearlySavingsPct(plan.price.monthly, plan.price.yearly) : null

            return (
              <div
                key={id}
                className={`relative rounded-2xl p-4 flex flex-col ${
                  isCurrent
                    ? "bg-[#c5f135]/10 border-2 border-[#c5f135]"
                    : highlighted
                    ? "bg-[#1a2110] border-2 border-[#c5f135]/40"
                    : "bg-[#1a2110] border border-[#2e3d1a]"
                }`}
              >
                {highlighted && !isCurrent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-widest bg-[#c5f135] text-[#1a2110] px-2.5 py-0.5 rounded-full">
                    Most popular
                  </span>
                )}

                <p className={`text-sm font-black ${isCurrent ? "text-[#c5f135]" : "text-white"}`}>{plan.name}</p>
                {plan.tagline && <p className="text-[11px] text-white/50 mt-0.5">{plan.tagline}</p>}

                <div className="mt-2 mb-0.5">
                  {plan.price === null ? (
                    <span className="text-xl font-black text-white">$0</span>
                  ) : (
                    <>
                      <span className="text-xl font-black text-white">
                        ${interval === "monthly" ? plan.price.monthly : plan.price.yearly}
                      </span>
                      <span className="text-xs text-white/40"> /{interval === "monthly" ? "mo" : "yr"}</span>
                    </>
                  )}
                </div>
                {plan.price && interval === "yearly" && savingsPct !== null && (
                  <p className="text-[10px] text-[#c5f135]/70 font-bold mb-2">Save {savingsPct}% vs. monthly</p>
                )}
                {plan.price && interval === "monthly" && <div className="mb-2" />}

                <Button
                  variant={isCurrent ? "ghost" : "primary"}
                  onClick={() => switchTo(id)}
                  disabled={switching !== null || isCurrent}
                  className="w-full text-center mb-3"
                >
                  {switching === id ? "Switching…" : isCurrent ? "Current plan" : "Switch to this plan"}
                </Button>

                <ul className="space-y-1.5 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5 text-xs text-white/65">
                      <Check className="w-3.5 h-3.5 text-[#c5f135] shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        <p className="text-center text-xs text-white/35 mt-6 max-w-lg mx-auto leading-relaxed">
          Every plan can also purchase a lifetime verification badge for a one-time ${LIFETIME_VERIFICATION_PRICE} fee,
          which stays even if you later cancel a paid plan. Verified badges included with a paid plan last only as
          long as the subscription stays active.
        </p>
      </Card>
    </div>
  )
}
