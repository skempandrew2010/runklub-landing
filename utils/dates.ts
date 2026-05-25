/** Returns YYYY-MM-DD in the user's local timezone (not UTC) */
export function localDateStr(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
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