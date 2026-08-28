import type { SupabaseClient } from "@supabase/supabase-js"
import { PLANS, PlanId, CUSTOM_PRICING_MESSAGE } from "@/lib/plans"

// "Member" here means any subscriptions row for the klub — free followers
// and paid members both count, matching the public "X members" count shown
// on club pages (app/clubs/[clubId]/page.tsx).
export async function getClubMemberCount(client: SupabaseClient, clubId: string): Promise<number> {
  const { count } = await client
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)
  return count ?? 0
}

export function memberLimitForTier(tier: PlanId | null | undefined): number | null {
  if (!tier || !(tier in PLANS)) return null
  return PLANS[tier].memberLimit
}

export function memberCapMessage(limit: number): string {
  return limit >= 500
    ? `This klub has reached its ${limit}-member limit. ${CUSTOM_PRICING_MESSAGE}`
    : `This klub has reached its ${limit}-member limit for its current plan. The director can upgrade to raise it.`
}

// Checks whether adding one more member would exceed the klub's tier limit.
// Pass the club's current tier (clubs.tier) — free/null tiers are unlimited.
export async function isClubAtMemberCap(
  client: SupabaseClient,
  clubId: string,
  tier: PlanId | null | undefined
): Promise<{ atCap: boolean; count: number; limit: number | null }> {
  const limit = memberLimitForTier(tier)
  if (limit === null) return { atCap: false, count: 0, limit: null }
  const count = await getClubMemberCount(client, clubId)
  return { atCap: count >= limit, count, limit }
}
