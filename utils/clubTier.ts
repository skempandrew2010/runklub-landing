const VERIFIED_TIERS = ["starter", "growth", "enterprise"]

/** Paid-tier klubs show the "VERIFIED" badge and get stricter check-in geofencing. */
export function isVerifiedClub(tier: string | null | undefined): boolean {
  return !!tier && VERIFIED_TIERS.includes(tier)
}
