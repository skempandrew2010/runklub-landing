import type { SupabaseClient } from "@supabase/supabase-js"
import { CLUB_ID } from "./constants"
import { PLANS } from "@/lib/plans"

export type ClubModelTier = "starter" | "pro" | "premium"

// The prototype is single-club today, so tier-gating means reading the one
// seeded test club's clubs.tier. Starter/Pro/Premium all get into the club-
// management system; Free doesn't. Region/coach counts are capped per tier
// (see lib/plans.ts) — Starter's "1 location, no regions" model means it
// gets in but can't add any regions at all.
export async function getClubModelTier(admin: SupabaseClient): Promise<ClubModelTier | null> {
  const { data } = await admin.from("clubs").select("tier").eq("id", CLUB_ID).single()
  return data?.tier === "starter" || data?.tier === "pro" || data?.tier === "premium" ? data.tier : null
}

// null return means unlimited; no tier at all means zero.
export function regionLimitForTier(tier: ClubModelTier | null): number | null {
  return tier ? PLANS[tier].regionLimit : 0
}

export function coachLimitForTier(tier: ClubModelTier | null): number | null {
  return tier ? PLANS[tier].coachLimit : 0
}

// The tier a club would need to upgrade to next in order to raise its
// current region/coach limit by one step. Used to power "Upgrade to ___" nudges.
export function nextTierForMoreRegions(tier: ClubModelTier | null): "starter" | "pro" | "premium" {
  if (tier === "pro") return "premium"
  return "pro"
}

export function nextTierForMoreCoaches(tier: ClubModelTier | null): "starter" | "pro" | "premium" {
  if (tier === "pro") return "premium"
  return "pro"
}
