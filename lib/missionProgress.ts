export type ChallengeType = "streak" | "social" | "discovery" | "milestone" | "club_vs_club" | "seasonal"

export type ChallengeRow = {
  id: string
  slug: string
  name: string
  description: string | null
  type: ChallengeType
  criteria_config: Record<string, any>
}

/** Progress-bar numbers vary by challenge shape, so read them out explicitly per slug. Shared between client (Missions page) and server (check-in completion popup). */
export function getProgressDisplay(challenge: ChallengeRow, progress: Record<string, any> | undefined) {
  const cfg = challenge.criteria_config || {}
  const p = progress || {}
  switch (challenge.slug) {
    case "never-miss-4":
    case "never-miss-8":
    case "never-miss-12":
      return { current: p.current_streak ?? 0, target: cfg.weeks ?? 0, metricLabel: "weeks" }
    case "weekend-warrior":
      return { current: p.current_streak ?? 0, target: cfg.weekends ?? 0, metricLabel: "weekends" }
    case "bring-a-friend":
      return { current: p.referrals ?? 0, target: cfg.referrals ?? 1, metricLabel: "friends tagged" }
    case "klub-crew":
      return { current: p.friends_this_checkin ?? 0, target: cfg.friends ?? 3, metricLabel: "friends on one run" }
    case "try-3-klubs":
      return { current: p.distinct_clubs ?? 0, target: cfg.clubs ?? 3, metricLabel: "klubs" }
    case "morning-person":
      return { current: p.morning_checkins ?? 0, target: cfg.checkins ?? 5, metricLabel: "early check-ins" }
    case "consistency-club":
      return { current: p.total_checkins ?? 0, target: cfg.checkins ?? 10, metricLabel: "check-ins" }
    case "comeback":
      // Binary — either you just came back from a gap or you haven't. No meaningful progress bar.
      return { current: 0, target: 1, metricLabel: "" }
    default:
      return { current: 0, target: 1, metricLabel: "" }
  }
}
