// One-time setup: creates every Product + Price this app needs in Stripe
// LIVE mode, mirroring what already exists in test mode (SaaS tier plans +
// Passport credit tiers). Test-mode and live-mode objects are entirely
// separate in Stripe — nothing carries over automatically, so this recreates
// them from the known amounts baked into the app (lib/plans.ts for SaaS
// tiers, supabase/migrations/20260812150000_passport_credit_program.sql for
// Passport tiers).
//
// Usage: node scripts/create-live-stripe-prices.mjs [--dry-run]
// Requires a LIVE STRIPE_SECRET_KEY (sk_live_...) in .env.local. Prints the
// new price IDs — paste them into .env.local AND Vercel's Production env
// afterward.

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
if (!SECRET_KEY.startsWith("sk_live_")) {
  console.error(`STRIPE_SECRET_KEY doesn't look like a live key (got prefix "${SECRET_KEY.slice(0, 8)}..."). Refusing to run — this script is for live mode only.`)
  process.exit(1)
}

const stripe = new Stripe(SECRET_KEY)

const SAAS_TIERS = [
  { key: "STARTER", name: "RunKlub — Starter", monthly: 2499, yearly: 24999 },
  { key: "GROWTH", name: "RunKlub — Growth", monthly: 4999, yearly: 49999 },
  { key: "ENTERPRISE", name: "RunKlub — Enterprise", monthly: 9999, yearly: 99999 },
]

const PASSPORT_TIERS = [
  { tier: 1, name: "RunKlub Passport — Tier 1", monthly: 1500, yearly: 16000 },
  { tier: 2, name: "RunKlub Passport — Tier 2", monthly: 2500, yearly: 27000 },
  { tier: 3, name: "RunKlub Passport — Tier 3", monthly: 3300, yearly: 35000 },
  { tier: 4, name: "RunKlub Passport — Tier 4", monthly: 4000, yearly: 43000 },
]

async function createMonthlyYearlyPair(productName, monthlyCents, yearlyCents, metadata) {
  if (DRY_RUN) {
    console.log(`[dry-run] would create product "${productName}" + monthly $${(monthlyCents / 100).toFixed(2)} + yearly $${(yearlyCents / 100).toFixed(2)}`)
    return { monthlyPriceId: "(dry-run)", yearlyPriceId: "(dry-run)" }
  }

  const product = await stripe.products.create({ name: productName, metadata })
  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: monthlyCents,
    recurring: { interval: "month" },
    metadata,
  })
  const yearlyPrice = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: yearlyCents,
    recurring: { interval: "year" },
    metadata,
  })
  return { monthlyPriceId: monthlyPrice.id, yearlyPriceId: yearlyPrice.id }
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no objects will be created.\n" : "Creating live-mode Products/Prices...\n")

  const envLines = []

  for (const { key, name, monthly, yearly } of SAAS_TIERS) {
    console.log(`SaaS tier ${key}: ${name}`)
    const { monthlyPriceId, yearlyPriceId } = await createMonthlyYearlyPair(name, monthly, yearly, { saasTier: key.toLowerCase() })
    envLines.push(`STRIPE_${key}_MONTHLY_PRICE_ID=${monthlyPriceId}`)
    envLines.push(`STRIPE_${key}_YEARLY_PRICE_ID=${yearlyPriceId}`)
  }

  for (const { tier, name, monthly, yearly } of PASSPORT_TIERS) {
    console.log(`Passport tier ${tier}: ${name}`)
    const { monthlyPriceId, yearlyPriceId } = await createMonthlyYearlyPair(name, monthly, yearly, { passportProgram: "true", tier: String(tier) })
    envLines.push(`STRIPE_PASSPORT_TIER${tier}_MONTHLY_PRICE_ID=${monthlyPriceId}`)
    envLines.push(`STRIPE_PASSPORT_TIER${tier}_YEARLY_PRICE_ID=${yearlyPriceId}`)
  }

  console.log("\n" + (DRY_RUN ? "Dry run complete." : "Done.") + " New env values:\n")
  console.log(envLines.join("\n"))
}

main().catch((err) => {
  console.error("Failed:", err.message)
  process.exit(1)
})
