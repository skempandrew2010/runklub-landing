import type { PaceGroup, Location, Coach, TrainingSchedule, TrainingScheduleRegion, RegionDay, RegionDayTime, LocationCoach } from "./types"

// Picks the pace group whose [min,max] range contains the runner's pace.
// If the pace falls in a gap between ranges, falls back to whichever
// group's range is numerically closest.
export function matchPaceGroup(pace: number, groups: PaceGroup[]): PaceGroup | null {
  if (groups.length === 0) return null

  const containing = groups.find((g) => pace >= g.pace_min && pace <= g.pace_max)
  if (containing) return containing

  let closest = groups[0]
  let closestDistance = distanceToRange(pace, closest)
  for (const g of groups.slice(1)) {
    const d = distanceToRange(pace, g)
    if (d < closestDistance) {
      closest = g
      closestDistance = d
    }
  }
  return closest
}

function distanceToRange(pace: number, group: PaceGroup): number {
  if (pace < group.pace_min) return group.pace_min - pace
  if (pace > group.pace_max) return pace - group.pace_max
  return 0
}

export type LocationMatch = {
  location: Location | null
  coach: Coach | null
  time: string | null
}

// Given a pace group and a region, resolves where/when that group meets in
// that region and who coaches it there — the same logic used both at
// initial signup and whenever a member changes their region afterward.
// A region+day can have multiple meeting times now; this picks the first
// one as the default "primary" match — members can still see every option
// in their weekly schedule breakdown.
export function matchLocationForPaceGroup(
  paceGroupId: string,
  regionId: string,
  data: {
    training_schedules: TrainingSchedule[]
    training_schedule_regions: TrainingScheduleRegion[]
    region_days: RegionDay[]
    region_day_times: RegionDayTime[]
    locations: Location[]
    location_coaches: LocationCoach[]
    coaches: Coach[]
  }
): LocationMatch {
  const groupSchedules = data.training_schedules.filter((s) => s.pace_group_id === paceGroupId)
  const applicableScheduleIds = new Set(
    data.training_schedule_regions.filter((sr) => sr.region_id === regionId).map((sr) => sr.training_schedule_id)
  )
  const applicableSchedules = groupSchedules.filter((s) => applicableScheduleIds.has(s.id))
  const schedule = applicableSchedules[0] ?? null

  const regionDay = schedule
    ? data.region_days.find((rd) => rd.region_id === regionId && rd.day_of_week === schedule.day_of_week)
    : null
  const firstSlot = regionDay
    ? data.region_day_times.find((t) => t.region_day_id === regionDay.id) ?? null
    : null
  const location = firstSlot?.location_id ? data.locations.find((l) => l.id === firstSlot.location_id) ?? null : null
  const time = firstSlot?.time ?? null

  let coach: Coach | null = null
  if (location) {
    const link = data.location_coaches.find((lc) => lc.location_id === location.id)
    if (link) coach = data.coaches.find((c) => c.id === link.coach_id) ?? null
  }

  return { location, coach, time }
}
