// Creates 4 new yearly Stripe Prices for the Passport credit program at
// $160/$270/$350/$430, attached to the SAME Product as each tier's existing
// monthly price (so they show up together in the Stripe Dashboard). The old
// yearly Price IDs from earlier are stale (wrong amount) and can't be edited
// in place — Stripe Prices are immutable — so this makes new ones instead.
//
// Usage: node scripts/create-passport-yearly-prices.mjs [--dry-run]
// Requires STRIPE_SECRET_KEY and the 4 STRIPE_PASSPORT_TIER{n}_MONTHLY_PRICE_ID
// vars in .env.local. Prints the 4 new price IDs — paste them into
// STRIPE_PASSPORT_TIER{n}_YEARLY_PRICE_ID (locally and in Vercel) afterward.

import { readFileSync } from "fs"
import Stripe from "stripe"

const env = {}
try {
  readFileSync(".env.local", "utf8").split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=")
    if (key && rest.length) env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "")
  })
} catch { /* missing file — fall back to process.env */ }
const get = (k) => env[k] ?? process.env[k]

const DRY_RUN = process.argv.includes("--dry-run")

const SECRET_KEY = get("STRIPE_SECRET_KEY")
if (!SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY in .env.local — nothing to authenticate with.")
  process.exit(1)
}

const TIERS = [
  { tier: 1, monthlyEnvKey: "STRIPE_PASSPORT_TIER1_MONTHLY_PRICE_ID", yearlyAmountCents: 16000 },
  { tier: 2, monthlyEnvKey: "STRIPE_PASSPORT_TIER2_MONTHLY_PRICE_ID", yearlyAmountCents: 27000 },
  { tier: 3, monthlyEnvKey: "STRIPE_PASSPORT_TIER3_MONTHLY_PRICE_ID", yearlyAmountCents: 35000 },
  { tier: 4, monthlyEnvKey: "STRIPE_PASSPORT_TIER4_MONTHLY_PRICE_ID", yearlyAmountCents: 43000 },
]

const stripe = new Stripe(SECRET_KEY)

async function main() {
  const results = []

  for (const { tier, monthlyEnvKey, yearlyAmountCents } of TIERS) {
    const monthlyPriceId = get(monthlyEnvKey)
    if (!monthlyPriceId) {
      console.error(`Skipping Tier ${tier}: ${monthlyEnvKey} not set in .env.local`)
      continue
    }

    const monthlyPrice = await stripe.prices.retrieve(monthlyPriceId)
    const productId = typeof monthlyPrice.product === "string" ? monthlyPrice.product : monthlyPrice.product.id

    console.log(`Tier ${tier}: product ${productId}, creating yearly price at $${(yearlyAmountCents / 100).toFixed(2)}...`)

    if (DRY_RUN) {
      results.push({ tier, priceId: "(dry-run, not created)" })
      continue
    }

    const yearlyPrice = await stripe.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: yearlyAmountCents,
      recurring: { interval: "year" },
      metadata: { passportProgram: "true", tier: String(tier) },
    })

    results.push({ tier, priceId: yearlyPrice.id })
  }

  console.log("\n" + (DRY_RUN ? "Dry run complete." : "Done.") + " New env values:\n")
  for (const { tier, priceId } of results) {
    console.log(`STRIPE_PASSPORT_TIER${tier}_YEARLY_PRICE_ID=${priceId}`)
  }
}

main().catch((err) => {
  console.error("Failed:", err.message)
  process.exit(1)
})
