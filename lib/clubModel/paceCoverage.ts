import type { PaceGroup } from "./types"

export type PaceCoverageGap = { fromPace: number; toPace: number }
export type PaceCoverageOverlap = { groupA: PaceGroup; groupB: PaceGroup }

// Adjacent-pair coverage check across a club's pace groups, sorted by
// pace_min. matchPaceGroup's nearest-distance fallback already handles
// runners faster than the fastest group or slower than the slowest, so this
// only needs to flag gaps/overlaps *between* groups.
const EPSILON = 1e-6

export function validatePaceGroupCoverage(groups: PaceGroup[]): {
  gaps: PaceCoverageGap[]
  overlaps: PaceCoverageOverlap[]
} {
  const sorted = groups.slice().sort((a, b) => a.pace_min - b.pace_min)
  const gaps: PaceCoverageGap[] = []
  const overlaps: PaceCoverageOverlap[] = []

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    if (curr.pace_min > prev.pace_max + EPSILON) {
      gaps.push({ fromPace: prev.pace_max, toPace: curr.pace_min })
    } else if (curr.pace_min < prev.pace_max - EPSILON) {
      overlaps.push({ groupA: prev, groupB: curr })
    }
  }

  return { gaps, overlaps }
}
