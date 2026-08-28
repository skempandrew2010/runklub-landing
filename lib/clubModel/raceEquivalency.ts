// Converts between a race time for a given distance and an equivalent
// marathon pace, using Riegel's formula (T2 = T1 * (D2/D1)^1.06) -- the
// standard race-time-prediction formula. Pace groups (pace_min/pace_max in
// ./pace.ts) are defined as marathon pace -- the average minutes/mile a
// runner holds over a full 26.2 miles, not a flat-out mile-race pace -- since
// that's the effort a training group is actually built around. Anchoring the
// conversion at the marathon end and predicting the shorter distances (which
// Riegel says get disproportionately faster, not just linearly faster) is
// also what actually reproduces "sub 17 5k / sub 35 10k / sub 1:15 half" for
// a 6:00 marathon-pace group -- anchoring at the mile end predicts a 5k
// nearly 3 minutes slower than that.

export type RaceDistance = "mile" | "5k" | "10k" | "half" | "full"

export const RACE_DISTANCES: Record<RaceDistance, number> = {
  mile: 1,
  "5k": 3.106856,
  "10k": 6.213712,
  half: 13.10948,
  full: 26.21896,
}

export const RACE_DISTANCE_LABELS: Record<RaceDistance, string> = {
  mile: "Mile",
  "5k": "5K",
  "10k": "10K",
  half: "Half Marathon",
  full: "Marathon",
}

const RIEGEL_EXPONENT = 1.06

function riegel(time1: number, dist1: number, dist2: number): number {
  return time1 * Math.pow(dist2 / dist1, RIEGEL_EXPONENT)
}

/** Race time (seconds) for `distance` -> equivalent marathon pace (decimal minutes/mile). */
export function raceTimeToMarathonPace(distance: RaceDistance, totalSeconds: number): number {
  const marathonSeconds = riegel(totalSeconds, RACE_DISTANCES[distance], RACE_DISTANCES.full)
  return marathonSeconds / 60 / RACE_DISTANCES.full
}

/** Marathon pace (decimal minutes/mile) -> full marathon finish time (seconds). */
export function marathonFinishTime(marathonPaceMinutes: number): number {
  return marathonPaceMinutes * 60 * RACE_DISTANCES.full
}

/** A pace group's [pace_min, pace_max] marathon pace -> its marathon finish-time range, formatted. */
export function marathonTimeRangeLabel(paceMin: number, paceMax: number): string {
  const slow = formatRaceTime(marathonFinishTime(paceMax))
  if (paceMin <= 0) return `Under ${slow} marathon`
  const fast = formatRaceTime(marathonFinishTime(paceMin))
  return `${fast}–${slow} marathon`
}

/** Marathon pace (decimal minutes/mile) -> equivalent race time (seconds) for `distance`. */
export function marathonPaceToRaceTime(distance: RaceDistance, marathonPaceMinutes: number): number {
  const marathonSeconds = marathonPaceMinutes * 60 * RACE_DISTANCES.full
  return riegel(marathonSeconds, RACE_DISTANCES.full, RACE_DISTANCES[distance])
}

// A marathon-pace band wide enough to cover elite through walk-run paces.
// Used to catch input-format mistakes (e.g. typing "1:45" for a half
// marathon, meaning 1:45:00, but it parses as 1 minute 45 seconds) that
// would otherwise silently produce a nonsense match instead of an error.
const PLAUSIBLE_MARATHON_PACE_MIN = 3.5
const PLAUSIBLE_MARATHON_PACE_MAX = 25

/**
 * Parses a race time as `h:mm:ss` or `m:ss` into total seconds. When
 * `distance` is given (anything but a direct training pace), the implied
 * marathon-pace equivalent is checked against a plausible band and rejected
 * (returns null) if it's wildly off -- almost always a format mistake
 * rather than a genuinely elite or genuinely slow runner.
 */
export function parseRaceTime(input: string, distance?: RaceDistance): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  let totalSeconds: number | null = null

  const hms = trimmed.match(/^(\d{1,2}):([0-5]?\d):([0-5]\d)$/)
  if (hms) {
    const hours = Number(hms[1])
    const minutes = Number(hms[2])
    const seconds = Number(hms[3])
    totalSeconds = hours * 3600 + minutes * 60 + seconds
  } else {
    const ms = trimmed.match(/^(\d{1,3}):([0-5]\d)$/)
    if (ms) {
      const minutes = Number(ms[1])
      const seconds = Number(ms[2])
      totalSeconds = minutes * 60 + seconds
    }
  }

  if (totalSeconds === null || totalSeconds <= 0) return null

  if (distance) {
    const impliedMarathonPace = raceTimeToMarathonPace(distance, totalSeconds)
    if (impliedMarathonPace < PLAUSIBLE_MARATHON_PACE_MIN || impliedMarathonPace > PLAUSIBLE_MARATHON_PACE_MAX) return null
  }

  return totalSeconds
}

/** Formats total seconds as `h:mm:ss` (>=1hr) or `m:ss`. */
export function formatRaceTime(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const seconds = rounded % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

// Seven starting pace tiers for a klub that hasn't configured any pace
// groups yet -- ascending, contiguous (no gaps) marathon-pace ranges a
// director can edit or delete freely from there.
export const DEFAULT_PACE_GROUPS: { name: string; pace_min: number; pace_max: number }[] = [
  { name: "Sub 6:00 marathon pace", pace_min: 0, pace_max: 6 },
  { name: "Sub 7:00 marathon pace", pace_min: 6, pace_max: 7 },
  { name: "Sub 8:00 marathon pace", pace_min: 7, pace_max: 8 },
  { name: "Sub 9:00 marathon pace", pace_min: 8, pace_max: 9 },
  { name: "Sub 10:00 marathon pace", pace_min: 9, pace_max: 10 },
  { name: "Sub 11:00 marathon pace", pace_min: 10, pace_max: 11 },
  { name: "11:00–13:00 marathon pace", pace_min: 11, pace_max: 13 },
]
