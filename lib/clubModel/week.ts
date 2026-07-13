import { DAYS_OF_WEEK } from "./types"

// The actual calendar date (YYYY-MM-DD) for a given day name within the week
// that starts on weekOfMonday (itself a Monday, as returned by
// currentWeekMonday()) — lets recurring weekly training entries be placed
// alongside literal-dated community runs in a combined schedule view.
export function dateForDayOfWeek(weekOfMonday: string, dayName: string): string {
  const [year, month, day] = weekOfMonday.split("-").map(Number)
  const monday = new Date(year, month - 1, day)
  const offset = DAYS_OF_WEEK.indexOf(dayName as (typeof DAYS_OF_WEEK)[number])
  const target = new Date(monday)
  target.setDate(monday.getDate() + Math.max(offset, 0))
  const y = target.getFullYear()
  const m = String(target.getMonth() + 1).padStart(2, "0")
  const d = String(target.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function currentWeekMonday(): string {
  const now = new Date()
  const day = now.getDay() // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  return monday.toISOString().slice(0, 10)
}

// week_of is stored as the Monday of the week. Displays it as the Sun-Sat
// calendar range instead, e.g. "Sunday, 7/12 - Saturday, 7/18".
export function formatWeekRange(weekOf: string): string {
  const [year, month, day] = weekOf.split("-").map(Number)
  const monday = new Date(year, month - 1, day) // local midnight — avoids UTC-parse day-shift
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() - 1)
  const saturday = new Date(sunday)
  saturday.setDate(sunday.getDate() + 6)

  const fmt = (d: Date) => `${d.toLocaleDateString("en-US", { weekday: "long" })}, ${d.getMonth() + 1}/${d.getDate()}`
  return `${fmt(sunday)} - ${fmt(saturday)}`
}
