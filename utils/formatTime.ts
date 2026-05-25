export function formatTimeToAMPM(time24: string) {
  if (!time24) return ""
  const [hourStr, minStr] = time24.split(":")
  let hour = parseInt(hourStr)
  const minutes = minStr
  const ampm = hour >= 12 ? "PM" : "AM"
  hour = hour % 12
  if (hour === 0) hour = 12
  return `${hour}:${minutes} ${ampm}`
}