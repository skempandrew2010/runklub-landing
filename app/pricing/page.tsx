"use client"

import { useState } from "react"
import Link from "next/link"
import { Check } from "lucide-react"
import { PLANS, PLAN_ORDER, LIFETIME_VERIFICATION_PRICE, type BillingInterval } from "@/lib/plans"

function yearlySavingsPct(monthly: number, yearly: number) {
  const fullYear = monthly * 12
  return Math.round(((fullYear - yearly) / fullYear) * 100)
}

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly")

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-6xl mx-auto px-5 py-14">

        <div className="text-center mb-10">
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-2">Pricing</p>
          <h1 className="text-3xl sm:text-4xl font-black text-white">Plans for klubs of any size</h1>
          <p className="text-sm text-white/50 mt-3 max-w-md mx-auto">
            Start free. Upgrade when your klub is ready for more locations, more members, and more visibility.
          </p>
        </div>

        <div className="flex items-center justify-center gap-1 mb-12">
          <div className="inline-flex bg-[#1e2d12] border border-[#2e3d1a] rounded-full p-1">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id]
            const highlighted = id === "growth"
            const savingsPct = plan.price ? yearlySavingsPct(plan.price.monthly, plan.price.yearly) : null

            return (
              <div
                key={id}
                className={`relative rounded-2xl p-6 flex flex-col ${
                  highlighted
                    ? "bg-[#1e2d12] border-2 border-[#c5f135]"
                    : "bg-[#1e2d12] border border-[#2e3d1a]"
                }`}
              >
                {highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-widest bg-[#c5f135] text-[#1a2110] px-3 py-1 rounded-full">
                    Most popular
                  </span>
                )}

                <h2 className="text-xl font-black text-white">{plan.name}</h2>
                {plan.tagline && <p className="text-xs text-white/50 mt-1">{plan.tagline}</p>}

                <div className="mt-4 mb-1">
                  {plan.price === null ? (
                    <span className="text-3xl font-black text-white">$0</span>
                  ) : (
                    <>
                      <span className="text-3xl font-black text-white">
                        ${interval === "monthly" ? plan.price.monthly : plan.price.yearly}
                      </span>
                      <span className="text-sm text-white/40"> /{interval === "monthly" ? "mo" : "yr"}</span>
                    </>
                  )}
                </div>
                {plan.price && interval === "yearly" && savingsPct !== null && (
                  <p className="text-xs text-[#c5f135]/70 font-bold mb-3">Save {savingsPct}% vs. monthly</p>
                )}
                {plan.price && interval === "monthly" && <div className="mb-3" />}

                <Link
                  href="/login"
                  className={`block text-center px-4 py-2.5 rounded-full text-sm font-black transition mt-2 mb-6 ${
                    highlighted
                      ? "bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45]"
                      : "bg-[#1a2110] border border-[#2e3d1a] text-white hover:border-[#c5f135]/50 hover:text-[#c5f135]"
                  }`}
                >
                  {id === "free" ? "Get started" : "Upgrade"}
                </Link>

                <ul className="space-y-2.5 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-white/70">
                      <Check className="w-4 h-4 text-[#c5f135] shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        <p className="text-center text-xs text-white/35 mt-10 max-w-lg mx-auto leading-relaxed">
          Every plan can also purchase a lifetime verification badge for a one-time ${LIFETIME_VERIFICATION_PRICE} fee,
          which stays even if you later cancel a paid plan. Verified badges included with a paid plan last only as
          long as the subscription stays active.
        </p>
      </div>
    </div>
  )
}
