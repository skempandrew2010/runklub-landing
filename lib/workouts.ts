export type WorkoutSegment = {
  reps: string
  distance_time: string
  unit: string
  pace: string
  rest: string
  rest_unit: string
}

export const PACE_OPTIONS = ["Easy", "Aerobic", "Tempo", "LT", "Marathon", "HM", "10k", "5k", "3k", "mile", "800"] as const
export const DISTANCE_UNIT_OPTIONS = ["meters", "km", "miles"] as const
export const TIME_UNIT = "time"

/** Drag-and-drop payload type for dragging a workout from the library onto the weekly schedule. */
export const WORKOUT_DRAG_MIME = "application/x-runklub-workout-id"

/** Masks free-typed digits into a growing mm:ss value, e.g. "3" -> "3", "300" -> "3:00". */
export function maskMMSS(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, digits.length - 2)}:${digits.slice(-2)}`
}

export function formatWorkoutSegment(seg: WorkoutSegment): string {
  const amount = seg.unit === TIME_UNIT ? seg.distance_time : seg.unit ? `${seg.distance_time} ${seg.unit}` : seg.distance_time
  const rest = seg.rest_unit === TIME_UNIT ? seg.rest : seg.rest_unit ? `${seg.rest} ${seg.rest_unit}` : seg.rest
  const parts = [
    seg.reps && `${seg.reps}×`,
    amount,
    seg.pace && `@ ${seg.pace}`,
    rest && `— rest ${rest}`,
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
      rest: typeof s.rest === "string" ? s.rest : "",
      rest_unit: typeof s.rest_unit === "string" ? s.rest_unit : "",
    }))
}
