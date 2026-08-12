// Price-ID <-> tier/interval mapping for the Passport credit program,
// shared between the checkout route and the platform webhook so they can't
// drift. Monthly and yearly (annual gets 10% off — $162/$270/$356.40/$432,
// i.e. monthly * 12 * 0.9) both exist as real Stripe Prices; an annual
// subscriber still gets credits issued monthly (see next_credit_issue_at +
// the passport-yearly-monthly-credits cron), just billed once a year.

export type PassportBillingInterval = "monthly" | "yearly"

export const PASSPORT_TIER_PRICE_ENV: Record<number, Record<PassportBillingInterval, string | undefined>> = {
  1: {
    monthly: process.env.STRIPE_PASSPORT_TIER1_MONTHLY_PRICE_ID,
    yearly: process.env.STRIPE_PASSPORT_TIER1_YEARLY_PRICE_ID,
  },
  2: {
    monthly: process.env.STRIPE_PASSPORT_TIER2_MONTHLY_PRICE_ID,
    yearly: process.env.STRIPE_PASSPORT_TIER2_YEARLY_PRICE_ID,
  },
  3: {
    monthly: process.env.STRIPE_PASSPORT_TIER3_MONTHLY_PRICE_ID,
    yearly: process.env.STRIPE_PASSPORT_TIER3_YEARLY_PRICE_ID,
  },
  4: {
    monthly: process.env.STRIPE_PASSPORT_TIER4_MONTHLY_PRICE_ID,
    yearly: process.env.STRIPE_PASSPORT_TIER4_YEARLY_PRICE_ID,
  },
}

export function passportTierAndIntervalForPriceId(
  priceId: string | null | undefined
): { tier: number; interval: PassportBillingInterval } | null {
  if (!priceId) return null
  for (const [tier, byInterval] of Object.entries(PASSPORT_TIER_PRICE_ENV)) {
    for (const interval of ["monthly", "yearly"] as const) {
      if (byInterval[interval] === priceId) return { tier: Number(tier), interval }
    }
  }
  return null
}
