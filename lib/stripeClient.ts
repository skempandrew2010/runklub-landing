import { loadStripe, type Stripe } from "@stripe/stripe-js"

// One loadStripe() call per distinct connected account — Stripe.js ties the
// account context to the script load itself, so a Connect-scoped checkout
// (club membership payments) needs its own instance separate from the
// platform-level one (SaaS plans, Passport).
const stripePromiseCache = new Map<string, Promise<Stripe | null>>()

// Returns null (instead of throwing) when the key isn't configured yet, so
// callers can render a friendly message rather than crash the page.
export function getStripePromise(stripeAccount?: string): Promise<Stripe | null> | null {
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!pk) return null
  const key = stripeAccount ?? "_platform"
  let promise = stripePromiseCache.get(key)
  if (!promise) {
    promise = loadStripe(pk, stripeAccount ? { stripeAccount } : undefined)
    stripePromiseCache.set(key, promise)
  }
  return promise
}
