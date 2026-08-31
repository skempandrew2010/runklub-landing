// Director-facing "what should I charge" planning calculator for Passport
// offers. Rates and the payout share are loaded live from
// passport_credit_sources / passport_payout_settings - the same tables
// passport_issue_credits()/passport_redeem_offer() read from at issuance
// and redemption time, so this calculator can never drift onto stale
// numbers. The arithmetic itself (credits x rate x share) is duplicated in
// SQL for the actual payout, since that computation has to happen inside
// the redemption RPC - but both sides read the same source-of-truth tables.

import { supabase } from "@/lib/supabase"

export type PricingTier = {
  key: string
  label: string
  ratePerCreditCents: number
}

export type PassportPricingConfig = {
  tiers: PricingTier[]
  payoutShare: number
}

// Mid-point reference used for Step 2's auto-suggestion - not the
// cheapest/most-expensive extreme.
const SUGGESTION_REFERENCE_KEY = "tier_2"

export const LOW_PAYOUT_WARNING_SHARE = 0.4

export const CREDIT_COST_MIN = 1
export const CREDIT_COST_MAX = 40

export async function loadPassportPricingConfig(): Promise<PassportPricingConfig> {
  const [{ data: sources }, { data: settings }] = await Promise.all([
    supabase.from("passport_credit_sources").select("source, label, rate_per_credit_cents").eq("is_active", true),
    supabase.from("passport_payout_settings").select("payout_share").limit(1).maybeSingle(),
  ])

  return {
    tiers: (sources ?? []).map((s) => ({
      key: s.source,
      label: s.label,
      ratePerCreditCents: Number(s.rate_per_credit_cents),
    })),
    payoutShare: settings ? Number(settings.payout_share) : 0.5,
  }
}

export function ratePerCredit(tier: PricingTier): number {
  return tier.ratePerCreditCents / 100
}

function findTier(config: PassportPricingConfig, key: string): PricingTier {
  const tier = config.tiers.find((t) => t.key === key)
  if (!tier) throw new Error(`Unknown pricing source: ${key}`)
  return tier
}

/** $ a director takes home for one redemption at `credits`, from a runner on `sourceKey`. */
export function calculatePayout(config: PassportPricingConfig, credits: number, sourceKey: string): number {
  return credits * ratePerCredit(findTier(config, sourceKey)) * config.payoutShare
}

/** Worst case (lowest per-credit rate) to best case (highest), across every source. */
export function calculatePayoutRange(config: PassportPricingConfig, credits: number): { low: number; high: number } {
  const rates = config.tiers.map(ratePerCredit)
  return {
    low: credits * Math.min(...rates) * config.payoutShare,
    high: credits * Math.max(...rates) * config.payoutShare,
  }
}

/** round(faceValue / referenceRate), clamped to the slider's range. */
export function suggestedCreditCost(config: PassportPricingConfig, faceValue: number): number {
  const reference = config.tiers.find((t) => t.key === SUGGESTION_REFERENCE_KEY) ?? config.tiers[0]
  if (!reference) return CREDIT_COST_MIN
  const raw = Math.round(faceValue / ratePerCredit(reference))
  return Math.min(CREDIT_COST_MAX, Math.max(CREDIT_COST_MIN, raw))
}

export type BreakdownRow = { key: string; label: string; payout: number; pctOfFaceValue: number | null }

/** One row per source for the "full breakdown" table. */
export function payoutBreakdown(config: PassportPricingConfig, credits: number, faceValue: number): BreakdownRow[] {
  return config.tiers.map((tier) => {
    const payout = calculatePayout(config, credits, tier.key)
    return {
      key: tier.key,
      label: tier.label,
      payout,
      pctOfFaceValue: faceValue > 0 ? (payout / faceValue) * 100 : null,
    }
  })
}
