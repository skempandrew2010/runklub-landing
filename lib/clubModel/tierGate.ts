import type { SupabaseClient } from "@supabase/supabase-js"
import { CLUB_ID } from "./constants"
import { PLANS } from "@/lib/plans"

export type ClubModelTier = "pro"

// The prototype is single-club today, so tier-gating means reading the one
// seeded test club's clubs.tier. Pro gets into the club-management system;
// Free doesn't. Region/coach counts are capped per tier (see lib/plans.ts).
export async function getClubModelTier(admin: SupabaseClient): Promise<ClubModelTier | null> {
  const { data } = await admin.from("clubs").select("tier").eq("id", CLUB_ID).single()
  return data?.tier === "pro" ? data.tier : null
}

// null return means unlimited; no tier at all means zero.
export function regionLimitForTier(tier: ClubModelTier | null): number | null {
  return tier ? PLANS[tier].regionLimit : 0
}

export function coachLimitForTier(tier: ClubModelTier | null): number | null {
  return tier ? PLANS[tier].coachLimit : 0
}

// Only one paid tier exists now, so "the next tier up" is always Pro.
export function nextTierForMoreRegions(_tier: ClubModelTier | null): "pro" {
  return "pro"
}

export function nextTierForMoreCoaches(_tier: ClubModelTier | null): "pro" {
  return "pro"
}
