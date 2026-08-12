// Price-ID <-> tier mapping for the Passport credit program, shared between
// the checkout route and the platform webhook so they can't drift. Monthly
// only — there's no yearly option per the tier spec (unlike the klub SaaS
// plans in lib/plans.ts).

export const PASSPORT_TIER_PRICE_ENV: Record<number, string | undefined> = {
  1: process.env.STRIPE_PASSPORT_TIER1_PRICE_ID,
  2: process.env.STRIPE_PASSPORT_TIER2_PRICE_ID,
  3: process.env.STRIPE_PASSPORT_TIER3_PRICE_ID,
  4: process.env.STRIPE_PASSPORT_TIER4_PRICE_ID,
}

export function passportTierForPriceId(priceId: string | null | undefined): number | null {
  if (!priceId) return null
  for (const [tier, envPriceId] of Object.entries(PASSPORT_TIER_PRICE_ENV)) {
    if (envPriceId && envPriceId === priceId) return Number(tier)
  }
  return null
}
