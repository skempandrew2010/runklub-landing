import type { ScheduledWorkout, TrainingSchedule, WorkoutType, PaceGroup } from "./types"

export type ResolvedWorkout = {
  workoutType: WorkoutType
  details: string | null
  sameAsGroup: PaceGroup | null
  // Whether THIS pace group's session is in person this week — independent
  // of the linked group's own in-person status, since two groups can mirror
  // the same workout content while meeting differently (e.g. one in person,
  // one on their own).
  isInPerson: boolean
}

// Resolves a scheduled workout's actual content — either its own
// workout_type_id, or (one level only, no chains) the matching week's
// workout owned by the pace group it mirrors.
export function resolveScheduledWorkout(
  sw: ScheduledWorkout,
  data: {
    training_schedules: TrainingSchedule[]
    scheduled_workouts: ScheduledWorkout[]
    workout_types: WorkoutType[]
    pace_groups: PaceGroup[]
  }
): ResolvedWorkout | null {
  if (sw.workout_type_id) {
    const workoutType = data.workout_types.find((t) => t.id === sw.workout_type_id)
    return workoutType ? { workoutType, details: sw.details, sameAsGroup: null, isInPerson: sw.is_in_person } : null
  }

  if (sw.same_as_pace_group_id) {
    const group = data.pace_groups.find((g) => g.id === sw.same_as_pace_group_id)
    if (!group) return null

    const groupScheduleIds = data.training_schedules.filter((s) => s.pace_group_id === group.id).map((s) => s.id)
    const source = data.scheduled_workouts.find(
      (w) => groupScheduleIds.includes(w.training_schedule_id) && w.week_of === sw.week_of && w.workout_type_id
    )
    if (!source?.workout_type_id) return null

    const workoutType = data.workout_types.find((t) => t.id === source.workout_type_id)
    return workoutType ? { workoutType, details: source.details, sameAsGroup: group, isInPerson: sw.is_in_person } : null
  }

  return null
}
