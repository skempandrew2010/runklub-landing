// Director-facing "what should I charge" planning tool for Passport offers.
// Deliberately a standalone advisory calculator, NOT wired to the live
// passport_tiers table or the real passport_redeem_offer payout formula
// (that RPC pays a flat 300 + credits*50 cents per redemption regardless of
// which tier the runner is on - see PASSPORT_LAUNCHED / the offers rebuild).
// These are forward-looking numbers for a possible future repricing, kept
// here as named constants specifically so they're easy to find and adjust
// without hunting through the component.

export type PricingTierKey = "addon" | "tier1" | "tier2" | "tier3"

export type PricingTier = {
  key: PricingTierKey
  label: string
  priceCents: number
  credits: number
}

export const PASSPORT_PLANNING_TIERS: PricingTier[] = [
  { key: "addon", label: "Add-on pack", priceCents: 600, credits: 10 },
  { key: "tier1", label: "Tier 1", priceCents: 1500, credits: 27 },
  { key: "tier2", label: "Tier 2", priceCents: 2500, credits: 50 },
  { key: "tier3", label: "Tier 3", priceCents: 4000, credits: 90 },
]

// Director's cut of whatever rate the redeeming runner's credits cost them.
export const PAYOUT_SHARE = 0.5

// Step 2's suggested credit cost is pegged to this tier's rate as the
// reference midpoint, not the cheapest/most-expensive extreme.
const SUGGESTION_REFERENCE_TIER: PricingTierKey = "tier2"

// A payout under this share of the director's own face value trips the
// Step 3 warning.
export const LOW_PAYOUT_WARNING_SHARE = 0.4

export const CREDIT_COST_MIN = 1
export const CREDIT_COST_MAX = 40

export function ratePerCredit(tier: PricingTier): number {
  return tier.priceCents / 100 / tier.credits
}

function findTier(key: PricingTierKey): PricingTier {
  const tier = PASSPORT_PLANNING_TIERS.find((t) => t.key === key)
  if (!tier) throw new Error(`Unknown pricing tier: ${key}`)
  return tier
}

/** $ a director takes home for one redemption at `credits`, from a runner on `tierKey`. */
export function calculatePayout(credits: number, tierKey: PricingTierKey): number {
  return credits * ratePerCredit(findTier(tierKey)) * PAYOUT_SHARE
}

/** Worst case (lowest per-credit rate) to best case (highest), across every tier. */
export function calculatePayoutRange(credits: number): { low: number; high: number } {
  const rates = PASSPORT_PLANNING_TIERS.map(ratePerCredit)
  return {
    low: credits * Math.min(...rates) * PAYOUT_SHARE,
    high: credits * Math.max(...rates) * PAYOUT_SHARE,
  }
}

/** round(faceValue / referenceRate), clamped to the slider's range. */
export function suggestedCreditCost(faceValue: number): number {
  const rate = ratePerCredit(findTier(SUGGESTION_REFERENCE_TIER))
  const raw = Math.round(faceValue / rate)
  return Math.min(CREDIT_COST_MAX, Math.max(CREDIT_COST_MIN, raw))
}

export type BreakdownRow = { key: PricingTierKey; label: string; payout: number; pctOfFaceValue: number | null }

/** One row per tier for the "full breakdown" table. */
export function payoutBreakdown(credits: number, faceValue: number): BreakdownRow[] {
  return PASSPORT_PLANNING_TIERS.map((tier) => {
    const payout = calculatePayout(credits, tier.key)
    return {
      key: tier.key,
      label: tier.label,
      payout,
      pctOfFaceValue: faceValue > 0 ? (payout / faceValue) * 100 : null,
    }
  })
}
