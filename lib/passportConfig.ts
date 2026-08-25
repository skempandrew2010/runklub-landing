// Flip to true once there are real Passport-enrolled klubs to redeem
// credits at. Until then the whole member-facing Passport tab (/passport,
// /passport/credits, /passport/tiers) shows a waitlist instead of the real
// feature. Client-safe (no env var reads) so it can be imported anywhere.
export const PASSPORT_LAUNCHED = false
