export type WorkoutSegment = {
  reps: string
  distance_time: string
  unit: string
  pace: string
}

export const PACE_OPTIONS = ["Tempo", "LT", "Marathon", "HM", "10k", "5k", "3k", "mile", "800"] as const
export const DISTANCE_UNIT_OPTIONS = ["meters", "km", "miles"] as const
export const TIME_UNIT_OPTIONS = ["sec", "min"] as const

export function formatWorkoutSegment(seg: WorkoutSegment): string {
  const parts = [
    seg.reps && `${seg.reps}×`,
    seg.unit ? `${seg.distance_time} ${seg.unit}` : seg.distance_time,
    seg.pace && `@ ${seg.pace}`,
  ].filter(Boolean)
  return parts.join(" ")
}

export function parseWorkoutStructure(raw: unknown): WorkoutSegment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s) => ({
      reps: typeof s.reps === "string" ? s.reps : "",
      distance_time: typeof s.distance_time === "string" ? s.distance_time : "",
      unit: typeof s.unit === "string" ? s.unit : "",
      pace: typeof s.pace === "string" ? s.pace : "",
    }))
}
