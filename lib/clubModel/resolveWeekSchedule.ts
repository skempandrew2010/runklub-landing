import type { PaceGroup, Region, Location, TrainingSchedule, TrainingScheduleRegion, RegionDay, RegionDayTime, ScheduledWorkout, WorkoutType } from "./types"
import { resolveScheduledWorkout, type ResolvedWorkout } from "./resolveWorkout"
import { currentWeekMonday } from "./week"
import { DAYS_OF_WEEK } from "./types"

type ResolveInput = {
  pace_groups: PaceGroup[]
  regions: Region[]
  locations: Location[]
  training_schedules: TrainingSchedule[]
  training_schedule_regions: TrainingScheduleRegion[]
  region_days: RegionDay[]
  region_day_times: RegionDayTime[]
  scheduled_workouts: ScheduledWorkout[]
  workout_types: WorkoutType[]
}

export type ClubWeekScheduleEntry = {
  dayOfWeek: string
  paceGroup: PaceGroup
  region: Region
  time: string | null
  location: Location | null
  workout: ResolvedWorkout | null
  // The concrete scheduled_workouts row for this pace group + week, if any —
  // needed to RSVP against, since "same as another group" entries still
  // resolve their own content through their own row, not the source's.
  scheduledWorkoutId: string | null
}

// Every session happening across the whole club for a given week (defaults
// to the current week) — every pace group, every region it trains in, not
// just one member's own match. A region+day can have multiple meeting times
// (e.g. 6am and 6pm), so an in-person day produces one entry per time slot.
// "On your own" days aren't tied to a physical time/place, so they always
// produce exactly one entry.
export function resolveClubWeekSchedule(data: ResolveInput, weekOf: string = currentWeekMonday()): ClubWeekScheduleEntry[] {
  const entries: ClubWeekScheduleEntry[] = []

  for (const schedule of data.training_schedules) {
    const paceGroup = data.pace_groups.find((g) => g.id === schedule.pace_group_id)
    if (!paceGroup) continue

    const sw = data.scheduled_workouts.find((w) => w.training_schedule_id === schedule.id && w.week_of === weekOf)
    const workout = sw ? resolveScheduledWorkout(sw, data) : null
    const isInPerson = workout ? workout.isInPerson : true

    const regionIds = data.training_schedule_regions
      .filter((sr) => sr.training_schedule_id === schedule.id)
      .map((sr) => sr.region_id)

    for (const regionId of regionIds) {
      const region = data.regions.find((r) => r.id === regionId)
      if (!region) continue

      const base = { dayOfWeek: schedule.day_of_week, paceGroup, region, workout, scheduledWorkoutId: sw?.id ?? null }

      if (!isInPerson) {
        entries.push({ ...base, time: null, location: null })
        continue
      }

      const regionDay = data.region_days.find((rd) => rd.region_id === regionId && rd.day_of_week === schedule.day_of_week)
      const slots = regionDay ? data.region_day_times.filter((t) => t.region_day_id === regionDay.id) : []

      if (slots.length === 0) {
        entries.push({ ...base, time: null, location: null })
      } else {
        for (const slot of slots) {
          entries.push({
            ...base,
            time: slot.time ?? null,
            location: slot.location_id ? data.locations.find((l) => l.id === slot.location_id) ?? null : null,
          })
        }
      }
    }
  }

  return entries.sort((a, b) => {
    const dayDiff = DAYS_OF_WEEK.indexOf(a.dayOfWeek as (typeof DAYS_OF_WEEK)[number]) - DAYS_OF_WEEK.indexOf(b.dayOfWeek as (typeof DAYS_OF_WEEK)[number])
    if (dayDiff !== 0) return dayDiff
    const groupDiff = a.paceGroup.name.localeCompare(b.paceGroup.name)
    if (groupDiff !== 0) return groupDiff
    return (a.time ?? "").localeCompare(b.time ?? "")
  })
}
