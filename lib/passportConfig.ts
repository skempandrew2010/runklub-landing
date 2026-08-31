// Flip to true once there are real Passport-enrolled klubs to redeem
// credits at. Until then the whole member-facing Passport tab (/passport,
// /passport/credits, /passport/tiers) shows a waitlist instead of the real
// feature. Client-safe (no env var reads) so it can be imported anywhere.
export const PASSPORT_LAUNCHED = false

// Accounts that get the real Passport flow ahead of the public launch, for
// internal testing while PASSPORT_LAUNCHED is still false. Matched against
// the signed-in user's email, case-insensitive. Remove once launched.
const PASSPORT_EARLY_ACCESS_EMAILS = new Set([
  "skempandrew2010@gmail.com",
  "andrewskemp@yahoo.com",
])

export function hasPassportAccess(email: string | null | undefined): boolean {
  if (PASSPORT_LAUNCHED) return true
  return !!email && PASSPORT_EARLY_ACCESS_EMAILS.has(email.toLowerCase())
}
