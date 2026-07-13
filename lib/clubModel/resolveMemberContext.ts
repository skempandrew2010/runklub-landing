import type { Member, PaceGroup, Region, Coach } from "./types"

type ResolveInput = {
  pace_groups: PaceGroup[]
  regions: Region[]
  coaches: Coach[]
}

export type MemberContext = {
  paceGroup: PaceGroup | null
  region: Region | null
  coach: Coach | null
}

// Given a member's stored matches (pace_group_id, coach_id, preferred_region_id),
// resolves the pace group, region, and coach objects for display.
export function resolveMemberContext(member: Pick<Member, "pace_group_id" | "coach_id" | "preferred_region_id">, data: ResolveInput): MemberContext {
  const paceGroup = data.pace_groups.find((g) => g.id === member.pace_group_id) ?? null
  const region = data.regions.find((r) => r.id === member.preferred_region_id) ?? null
  const coach = data.coaches.find((c) => c.id === member.coach_id) ?? null

  return { paceGroup, region, coach }
}
