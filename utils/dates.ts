/** Returns YYYY-MM-DD in the user's local timezone (not UTC) */
export function localDateStr(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Returns the Monday (YYYY-MM-DD) of the week containing the given date. */
export function mondayOf(d: Date = new Date()): string {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return localDateStr(monday)
}

export function getNextRunDate(day: string, time: string) {
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]

  const today = new Date()
  const todayIndex = today.getDay()
  const targetIndex = days.indexOf(day)

  if (targetIndex === -1) return null

  let diff = (targetIndex - todayIndex + 7) % 7
  if (diff === 0) diff = 7

  const nextDate = new Date()
  nextDate.setDate(today.getDate() + diff)

  const [hours, minutes] = time.split(":").map(Number)

  nextDate.setHours(hours, minutes, 0)

  return nextDate.toISOString()
}