import type { SupabaseClient } from "@supabase/supabase-js"
import { PLANS, PlanId, CUSTOM_PRICING_MESSAGE } from "@/lib/plans"

// "Member" means a paid subscriber (member_type = 'paid') - the same
// convention already used in app/api/director/analytics/route.ts. Free
// "followers" (Follow button, or any subscriptions row that never became
// paid) are never capped, no matter how many a klub has.
export async function getClubMemberCount(client: SupabaseClient, clubId: string): Promise<number> {
  const { count } = await client
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)
    .eq("member_type", "paid")
  return count ?? 0
}

export function memberLimitForTier(tier: PlanId | null | undefined): number | null {
  if (!tier || !(tier in PLANS)) return null
  return PLANS[tier].memberLimit
}

export function memberCapMessage(limit: number): string {
  return limit >= 500
    ? `This klub has reached its ${limit} paid-member limit. ${CUSTOM_PRICING_MESSAGE}`
    : `This klub has reached its ${limit} paid-member limit for its current plan. The director can upgrade to raise it.`
}

// Checks whether adding one more paid member would exceed the klub's tier
// limit. Pass the club's current tier (clubs.tier) - free/null tiers are
// unlimited, and free followers never count toward this regardless of tier.
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
