"use client"

import { useEffect, useState } from "react"
import { X, ChevronDown, AlertTriangle } from "lucide-react"
import ModalPortal from "@/components/ModalPortal"
import { NumberStepper } from "@/app/admin/club-model/manager/ui"
import {
  CREDIT_COST_MIN,
  CREDIT_COST_MAX,
  LOW_PAYOUT_WARNING_SHARE,
  calculatePayoutRange,
  payoutBreakdown,
  suggestedCreditCost,
  loadPassportPricingConfig,
  type PassportPricingConfig,
} from "@/lib/passportPricing"

type Mode = "flat" | "membership"

// Planning tool, not a live price editor - a director works out what a
// session is worth to them, previews the credit-cost range against every
// live credit source's payout rate, then (optionally) applies the number
// they land on straight into the offer form that opened this. Rates come
// from the same passport_credit_sources/passport_payout_settings tables
// the real redemption RPC reads, so this never drifts from the live payout.
export default function PassportPricingCalculatorModal({
  onClose,
  onApply,
}: {
  onClose: () => void
  onApply?: (credits: number) => void
}) {
  const [config, setConfig] = useState<PassportPricingConfig | null>(null)
  const [mode, setMode] = useState<Mode>("flat")
  const [flatPrice, setFlatPrice] = useState("")
  const [membershipPrice, setMembershipPrice] = useState("")
  const [sessionsPerMonth, setSessionsPerMonth] = useState("")
  const [credits, setCredits] = useState(CREDIT_COST_MIN)
  const [manuallySet, setManuallySet] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)

  useEffect(() => {
    loadPassportPricingConfig().then(setConfig)
  }, [])

  const faceValue = mode === "flat"
    ? parseFloat(flatPrice) || 0
    : (() => {
        const price = parseFloat(membershipPrice) || 0
        const sessions = parseFloat(sessionsPerMonth) || 0
        return sessions > 0 ? price / sessions : 0
      })()

  // Auto-follows Step 1 until the director drags the slider themselves -
  // once they do, their choice is never silently overwritten again.
  useEffect(() => {
    if (!config || manuallySet || faceValue <= 0) return
    setCredits(suggestedCreditCost(config, faceValue))
  }, [config, faceValue, manuallySet])

  const { low, high } = config ? calculatePayoutRange(config, credits) : { low: 0, high: 0 }
  const showWarning = faceValue > 0 && low < faceValue * LOW_PAYOUT_WARNING_SHARE
  const breakdown = config ? payoutBreakdown(config, credits, faceValue) : []
  const suggestion = config && faceValue > 0 ? suggestedCreditCost(config, faceValue) : null

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div
          className="w-full sm:max-w-sm max-h-[85vh] overflow-y-auto rk-scroll bg-[#1e2d12] border border-[#2e3d1a] rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5 animate-[fadeUp_0.25s_ease-out_forwards]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-lg font-black text-white">Price this offer</p>
              <p className="text-xs text-white/40 mt-0.5">A rough guide, not a live quote</p>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white/60 transition p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {!config ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* STEP 1 */}
              <div className="mb-5">
                <p className="text-[10px] font-black text-[#c5f135]/70 uppercase tracking-widest mb-1">Step 1</p>
                <h3 className="text-sm font-black text-white mb-3">What&apos;s it worth?</h3>

                <div className="relative grid grid-cols-2 rounded-full bg-[#1a2110] p-1 border border-[#2e3d1a] mb-3">
                  <div
                    className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-[#c5f135] transition-transform duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                      mode === "membership" ? "translate-x-full" : "translate-x-0"
                    }`}
                  />
                  <button
                    onClick={() => setMode("flat")}
                    className={`relative z-10 px-2 py-2 rounded-full text-xs font-bold transition-colors duration-400 ${mode === "flat" ? "text-[#1a2110]" : "text-white/40 hover:text-white/70"}`}
                  >
                    I know my price
                  </button>
                  <button
                    onClick={() => setMode("membership")}
                    className={`relative z-10 px-2 py-2 rounded-full text-xs font-bold transition-colors duration-400 ${mode === "membership" ? "text-[#1a2110]" : "text-white/40 hover:text-white/70"}`}
                  >
                    Work it out from membership
                  </button>
                </div>

                {mode === "flat" ? (
                  <div>
                    <label className="text-xs font-bold text-white/50 block mb-1.5">Price per session</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
                      <input
                        type="number" min="0" step="0.01" inputMode="decimal"
                        value={flatPrice}
                        onChange={(e) => setFlatPrice(e.target.value)}
                        placeholder="15.00"
                        className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl pl-7 pr-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#c5f135]/50 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-xs font-bold text-white/50 block mb-1.5">Monthly membership price</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
                        <input
                          type="number" min="0" step="0.01" inputMode="decimal"
                          value={membershipPrice}
                          onChange={(e) => setMembershipPrice(e.target.value)}
                          placeholder="120.00"
                          className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl pl-7 pr-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#c5f135]/50 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-white/50 block mb-1.5">Sessions included per month</label>
                      <NumberStepper
                        value={sessionsPerMonth}
                        onChange={setSessionsPerMonth}
                        min={0}
                        base={1}
                        placeholder="8"
                      />
                    </div>
                    {faceValue > 0 && (
                      <p className="text-xs text-white/40">&asymp; ${faceValue.toFixed(2)} per session</p>
                    )}
                  </div>
                )}
              </div>

              {/* STEP 2 */}
              <div className="mb-5 pt-5 border-t border-[#2e3d1a]">
                <p className="text-[10px] font-black text-[#c5f135]/70 uppercase tracking-widest mb-1">Step 2</p>
                <h3 className="text-sm font-black text-white mb-1">Set your price</h3>
                <p className="text-xs text-white/40 mb-3">
                  {suggestion == null
                    ? "Enter a price above to get a suggestion."
                    : manuallySet
                      ? `We suggested ${suggestion} - drag anytime to try a different price.`
                      : `We suggest ${suggestion}.`}
                </p>
                <input
                  type="range"
                  min={CREDIT_COST_MIN}
                  max={CREDIT_COST_MAX}
                  value={credits}
                  onChange={(e) => { setCredits(Number(e.target.value)); setManuallySet(true) }}
                  className="w-full accent-[#c5f135]"
                />
                <p className="text-center mt-1">
                  <span className="text-2xl font-black text-white">{credits}</span>{" "}
                  <span className="text-sm font-bold text-white/40">credit{credits === 1 ? "" : "s"}</span>
                </p>
              </div>

              {/* STEP 3 */}
              <div className="pt-5 border-t border-[#2e3d1a]">
                <p className="text-[10px] font-black text-[#c5f135]/70 uppercase tracking-widest mb-1">Step 3</p>
                <h3 className="text-sm font-black text-white mb-3">What you&apos;ll take home</h3>

                <div className="bg-[#1a2110] border border-[#2e3d1a] rounded-2xl p-4 text-center mb-3">
                  <p className="text-2xl font-black text-[#c5f135]">${low.toFixed(2)} - ${high.toFixed(2)}</p>
                  <p className="text-xs text-white/40 mt-1">per redemption, depends on which plan the runner is on</p>
                </div>

                {showWarning && (
                  <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2.5 mb-3">
                    <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-300 leading-relaxed">
                      On some plans this pays under {Math.round(LOW_PAYOUT_WARNING_SHARE * 100)}% of your ${faceValue.toFixed(2)} price - consider raising the credit cost.
                    </p>
                  </div>
                )}

                <button
                  onClick={() => setShowBreakdown((v) => !v)}
                  className="flex items-center gap-1 text-xs font-bold text-white/40 hover:text-white/70 transition"
                >
                  Show the full breakdown
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showBreakdown ? "rotate-180" : ""}`} />
                </button>

                {showBreakdown && (
                  <div className="mt-2 bg-[#1a2110] border border-[#2e3d1a] rounded-xl overflow-hidden divide-y divide-[#2e3d1a]">
                    {breakdown.map((row) => (
                      <div key={row.key} className="flex items-center justify-between px-3 py-2 text-xs gap-2">
                        <span className="text-white/70">{row.label}</span>
                        <span className="text-white/40">{row.pctOfFaceValue != null ? `${row.pctOfFaceValue.toFixed(0)}%` : "-"}</span>
                        <span className="font-bold text-[#c5f135] shrink-0">${row.payout.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {onApply && (
                <button
                  onClick={() => onApply(credits)}
                  className="w-full mt-5 py-3 rounded-2xl text-sm font-black bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] transition"
                >
                  Use {credits} credit{credits === 1 ? "" : "s"} for this offer
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}
