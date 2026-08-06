export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Phoenix", label: "Mountain Time – Arizona (no DST)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
]

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return "America/Chicago"
  }
}

/** Offset (in minutes, UTC minus zone) of `timeZone` at the given instant — positive east of UTC, e.g. -300 for CDT. */
function getTimeZoneOffsetMinutes(timeZone: string, atUtc: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(atUtc)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  const asUtc = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day),
    Number(map.hour), Number(map.minute), Number(map.second)
  )
  return (asUtc - atUtc.getTime()) / 60_000
}

/**
 * Converts a wall-clock date+time in `timeZone` to the real UTC instant.
 * Dependency-free equivalent of date-fns-tz's zonedTimeToUtc — offset is
 * computed at the target instant itself, so DST is handled correctly.
 */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  // Postgres `time` columns come back as "HH:MM:SS" (seconds included) — normalize
  // to "HH:MM" so we don't double up on the seconds we append below.
  const hhmm = timeStr.slice(0, 5)
  const naiveUtc = new Date(`${dateStr}T${hhmm}:00Z`)
  const offsetMin = getTimeZoneOffsetMinutes(timeZone, naiveUtc)
  const firstPass = new Date(naiveUtc.getTime() - offsetMin * 60_000)

  // On a DST transition day, the naive guess can land far enough from the
  // true instant to pick up the wrong side's offset (e.g. still-yesterday's
  // pre-transition offset). Re-derive the offset at the first-pass estimate
  // — much closer to the true instant — and use that one if it differs.
  const offsetMin2 = getTimeZoneOffsetMinutes(timeZone, firstPass)
  if (offsetMin2 === offsetMin) return firstPass
  return new Date(naiveUtc.getTime() - offsetMin2 * 60_000)
}

export type TimedRun = { date: string; time: string; timezone?: string | null }

/** The run's real start instant. Falls back to naive local-clock parsing for legacy rows with no stored timezone — same behavior the app has always had for those. */
export function runStartInstant(run: TimedRun): Date {
  if (run.timezone) return zonedTimeToUtc(run.date, run.time, run.timezone)
  const [h, m] = run.time.split(":").map(Number)
  const d = new Date(run.date + "T00:00:00")
  d.setHours(h, m, 0, 0)
  return d
}

/** Formats a run's time in whatever timezone is calling this — the viewer's own, when called client-side. */
export function formatRunTime(run: TimedRun, opts?: Intl.DateTimeFormatOptions): string {
  return runStartInstant(run).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...opts })
}

/** Formats a run's time in its OWN timezone with a zone abbreviation — for contexts with no viewer browser to convert for (emails, share images). */
export function formatRunTimeInOwnZone(run: TimedRun): string {
  if (!run.timezone) {
    const [h, m] = run.time.split(":").map(Number)
    const ampm = h >= 12 ? "PM" : "AM"
    const hour = h % 12 || 12
    return `${hour}:${String(m).padStart(2, "0")} ${ampm}`
  }
  return zonedTimeToUtc(run.date, run.time, run.timezone).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: run.timezone,
    timeZoneName: "short",
  })
}
