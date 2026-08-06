import { getDistanceMiles } from "@/utils/distance"

export const CHECKIN_RADIUS_MILES = 0.3
export const METRO_CHECKIN_RADIUS_MILES = 25

// Tighter radius + start-time window used only by the proactive check-in
// watcher — an auto-prompt needs real precision, not the looser fallback
// range the manual "Check In" button tolerates.
export const PROXIMITY_CHECKIN_RADIUS_MILES = 0.1
export const CHECKIN_WINDOW_BEFORE_MIN = 5
export const CHECKIN_WINDOW_AFTER_MIN = 30

export type GeofenceRun = {
  run_lat: number | null
  run_lng: number | null
}

export type GeofenceClub = {
  latitude: number | null
  longitude: number | null
}

export type CheckinTarget = { lat: number; lng: number; radiusMiles: number }

/** Same run → klub → city fallback chain the manual check-in button has always used. */
export function resolveCheckinTarget(
  run: GeofenceRun,
  club: GeofenceClub,
  cityFallback: { lat: number; lng: number } | null,
  { includeCityFallback = true }: { includeCityFallback?: boolean } = {}
): CheckinTarget | null {
  if (run.run_lat != null && run.run_lng != null) {
    return { lat: run.run_lat, lng: run.run_lng, radiusMiles: CHECKIN_RADIUS_MILES }
  }
  if (club.latitude != null && club.longitude != null) {
    return { lat: club.latitude, lng: club.longitude, radiusMiles: CHECKIN_RADIUS_MILES }
  }
  if (includeCityFallback && cityFallback) {
    return { lat: cityFallback.lat, lng: cityFallback.lng, radiusMiles: METRO_CHECKIN_RADIUS_MILES }
  }
  return null
}

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Geolocation not supported")); return }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
  })
}

export function isWithinRadius(pos: GeolocationPosition, target: CheckinTarget): boolean {
  return getDistanceMiles(pos.coords.latitude, pos.coords.longitude, target.lat, target.lng) <= target.radiusMiles
}

/** Is `now` within [runStart - windowBeforeMin, runStart + windowAfterMin]? */
export function isWithinCheckinWindow(
  runDate: string,
  runTime: string,
  now: Date = new Date(),
  windowBeforeMin = CHECKIN_WINDOW_BEFORE_MIN,
  windowAfterMin = CHECKIN_WINDOW_AFTER_MIN
): boolean {
  const [h, m] = runTime.split(":").map(Number)
  const start = new Date(runDate + "T00:00:00")
  start.setHours(h, m, 0, 0)
  const windowStart = new Date(start.getTime() - windowBeforeMin * 60_000)
  const windowEnd = new Date(start.getTime() + windowAfterMin * 60_000)
  return now >= windowStart && now <= windowEnd
}
