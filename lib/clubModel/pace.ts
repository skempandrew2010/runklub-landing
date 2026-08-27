// Pace is stored/compared as decimal minutes-per-mile (e.g. "9:30" -> 9.5).

export function parsePace(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const mmss = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (mmss) {
    const minutes = Number(mmss[1])
    const seconds = Number(mmss[2])
    if (seconds >= 60) return null
    return minutes + seconds / 60
  }

  const decimal = Number(trimmed)
  return Number.isFinite(decimal) ? decimal : null
}

export function formatPace(decimalMinutes: number): string {
  const minutes = Math.floor(decimalMinutes)
  const seconds = Math.round((decimalMinutes - minutes) * 60)
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

export function formatPaceRange(paceMin: number, paceMax: number): string {
  return `${formatPace(paceMin)}–${formatPace(paceMax)} /mi`
}
