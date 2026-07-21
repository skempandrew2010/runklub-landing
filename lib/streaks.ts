export type Stats = {
  totalRuns: number
  currentStreak: number
  longestStreak: number
}

export type Achievement = {
  id: string
  name: string
  description: string
  emoji: string
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_step",    name: "First Step",       description: "Your very first check-in",      emoji: "👟" },
  { id: "rhythm",        name: "Finding My Rhythm", description: "5 runs checked in",             emoji: "🏃" },
  { id: "regular",       name: "Regular",           description: "10 runs checked in",            emoji: "⚡" },
  { id: "dedicated",     name: "Dedicated",         description: "25 runs checked in",            emoji: "💪" },
  { id: "half_century",  name: "Half Century",      description: "50 runs checked in",            emoji: "🏅" },
  { id: "century_club",  name: "Century Club",      description: "100 runs checked in",           emoji: "💯" },
  { id: "on_a_roll",     name: "On A Roll",         description: "2-week streak",                 emoji: "🔥" },
  { id: "monthly",       name: "Monthly Warrior",   description: "4-week streak",                 emoji: "📅" },
  { id: "quarter",       name: "Quarter Strong",    description: "12-week streak",                emoji: "🏆" },
  { id: "year_rounder",  name: "Year Rounder",      description: "52-week streak",                emoji: "👑" },
]

export function unlockedAchievements(stats: Stats): Achievement[] {
  const { totalRuns, currentStreak, longestStreak } = stats
  const maxStreak = Math.max(currentStreak, longestStreak)
  return ACHIEVEMENTS.filter((a) => {
    switch (a.id) {
      case "first_step":   return totalRuns >= 1
      case "rhythm":       return totalRuns >= 5
      case "regular":      return totalRuns >= 10
      case "dedicated":    return totalRuns >= 25
      case "half_century": return totalRuns >= 50
      case "century_club": return totalRuns >= 100
      case "on_a_roll":    return maxStreak >= 2
      case "monthly":      return maxStreak >= 4
      case "quarter":      return maxStreak >= 12
      case "year_rounder": return maxStreak >= 52
      default:             return false
    }
  })
}

export function nextAchievement(stats: Stats): { achievement: Achievement; progress: number; target: number } | null {
  const { totalRuns, currentStreak } = stats
  const runMilestones = [
    { id: "first_step", target: 1 }, { id: "rhythm", target: 5 },
    { id: "regular", target: 10 },  { id: "dedicated", target: 25 },
    { id: "half_century", target: 50 }, { id: "century_club", target: 100 },
  ]
  const streakMilestones = [
    { id: "on_a_roll", target: 2 }, { id: "monthly", target: 4 },
    { id: "quarter", target: 12 },  { id: "year_rounder", target: 52 },
  ]
  const nextRun = runMilestones.find((m) => totalRuns < m.target)
  const nextStreak = streakMilestones.find((m) => currentStreak < m.target)
  const ach = nextRun ? ACHIEVEMENTS.find((a) => a.id === nextRun.id) : null
  if (ach && nextRun) return { achievement: ach, progress: totalRuns, target: nextRun.target }
  const sAch = nextStreak ? ACHIEVEMENTS.find((a) => a.id === nextStreak.id) : null
  if (sAch && nextStreak) return { achievement: sAch, progress: currentStreak, target: nextStreak.target }
  return null
}

/** Returns current and longest weekly streak from a list of checkin timestamps. */
export function computeStreaks(checkinTimestamps: string[]): { current: number; longest: number } {
  if (checkinTimestamps.length === 0) return { current: 0, longest: 0 }

  function toWeekMonday(iso: string): string {
    const d = new Date(iso)
    const day = d.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    const mon = new Date(d)
    mon.setUTCDate(d.getUTCDate() + diff)
    return mon.toISOString().slice(0, 10)
  }

  function addWeek(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00Z")
    d.setUTCDate(d.getUTCDate() + 7)
    return d.toISOString().slice(0, 10)
  }

  const weekSet = new Set(checkinTimestamps.map(toWeekMonday))
  const weeks = Array.from(weekSet).sort()

  // Longest streak (all-time)
  let longest = 1
  let run = 1
  for (let i = 1; i < weeks.length; i++) {
    if (addWeek(weeks[i - 1]) === weeks[i]) {
      run++
      longest = Math.max(longest, run)
    } else {
      run = 1
    }
  }

  // Current streak — must include this week or last week
  const now = new Date()
  const nowDay = now.getUTCDay()
  const nowDiff = nowDay === 0 ? -6 : 1 - nowDay
  const currMon = new Date(now)
  currMon.setUTCDate(now.getUTCDate() + nowDiff)
  const currMonStr = currMon.toISOString().slice(0, 10)

  const lastMonStr = (() => {
    const d = new Date(currMon)
    d.setUTCDate(d.getUTCDate() - 7)
    return d.toISOString().slice(0, 10)
  })()

  const mostRecent = weeks[weeks.length - 1]
  if (mostRecent !== currMonStr && mostRecent !== lastMonStr) return { current: 0, longest }

  let current = 1
  let prev = mostRecent
  for (let i = weeks.length - 2; i >= 0; i--) {
    const expected = new Date(prev + "T00:00:00Z")
    expected.setUTCDate(expected.getUTCDate() - 7)
    const expectedStr = expected.toISOString().slice(0, 10)
    if (weeks[i] === expectedStr) {
      current++
      prev = weeks[i]
    } else {
      break
    }
  }

  return { current, longest: Math.max(current, longest) }
}
