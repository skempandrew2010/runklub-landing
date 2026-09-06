// Canonical source of truth for RunKlub's director-facing SaaS plans. This is
// the `clubs.tier` field's full value set (extending the pro check in
// lib/clubModel/tierGate.ts) plus every price and limit tied to each tier.
// Nothing here is enforced automatically just by existing in this file -
// each limit still needs its own check wired in wherever it applies (see
// lib/clubModel/tierGate.ts for region caps, lib/emailUsage.ts for the
// monthly email cap).

export type PlanId = "free" | "pro"
export type BillingInterval = "monthly" | "yearly"
export type EmailCadence = "none" | "weekly" | "3x-week" | "daily"
export type SearchPlacement = "standard" | "first-in-city"
export type SponsorRaceNetworkAccess = "none" | "standard" | "priority"

export type Plan = {
  id: PlanId
  name: string
  tagline: string | null
  // null = free, no billing at all.
  price: { monthly: number; yearly: number } | null
  // Members (free or paid) are always unlimited on every tier - the monthly
  // email cap (see lib/emailUsage.ts) is the real usage-based lever now.
  memberLimit: null
  // Whether the club can charge its own members to join (clubs.membership_type
  // = optional_paid/paid_required) - separate from charging for individual
  // events (which every tier, including Free, can do). Both Free and Pro
  // allow this; kept as a per-plan flag in case that ever changes again.
  clubMembershipPaymentsAllowed: boolean
  // 0 = no access to the club-management (region/coach/schedule) system.
  // null = unlimited regions (Pro).
  regionLimit: number | null
  // Whether locations are the simple single-weekly-location model instead of
  // the full region/schedule system (Pro, regionLimit > 0). Unused today
  // since only Free (0) and Pro (unlimited) exist, but kept for a possible
  // future in-between tier.
  singleWeeklyLocationOnly: boolean
  coachLimit: number | null
  eventLimit: number | null
  // Added on top of Stripe's own processing fee, for event ticket payments.
  paymentFeeSurchargePct: number
  emailCadence: EmailCadence
  // Included newsletter/training-schedule emails per calendar month before
  // overage kicks in (see lib/emailUsage.ts). null = no email sending access
  // at all (Free can't send newsletters/training schedules today).
  monthlyEmailLimit: number | null
  instagramAutoPost: boolean
  chat: boolean
  pushNotifications: boolean
  raceBenefitsAccess: boolean
  sponsorBannersFree: boolean
  sponsorRaceNetworkAccess: SponsorRaceNetworkAccess
  searchPlacement: SearchPlacement
  // Display bullets for the pricing page, in order.
  features: string[]
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: null,
    price: null,
    memberLimit: null,
    clubMembershipPaymentsAllowed: true,
    regionLimit: 0,
    singleWeeklyLocationOnly: false,
    coachLimit: 0,
    eventLimit: null,
    paymentFeeSurchargePct: 3.9,
    emailCadence: "none",
    monthlyEmailLimit: null,
    instagramAutoPost: false,
    chat: true,
    pushNotifications: true,
    raceBenefitsAccess: false,
    sponsorBannersFree: false,
    sponsorRaceNetworkAccess: "none",
    searchPlacement: "standard",
    features: [
      "Unlimited followers and paid members",
      "Chat with your klub members",
      "Post free or paid community events, open to everyone",
      "Push notifications remind members of upcoming runs",
      "Charge members to join your klub, or keep it free",
      "Accept event payments (Stripe fee + 3.9%)",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Everything you need to run a serious klub",
    price: { monthly: 20, yearly: 200 },
    memberLimit: null,
    clubMembershipPaymentsAllowed: true,
    regionLimit: null,
    singleWeeklyLocationOnly: false,
    coachLimit: null,
    eventLimit: null,
    paymentFeeSurchargePct: 1.9,
    emailCadence: "daily",
    monthlyEmailLimit: 20000,
    instagramAutoPost: true,
    chat: true,
    pushNotifications: true,
    raceBenefitsAccess: true,
    sponsorBannersFree: true,
    sponsorRaceNetworkAccess: "priority",
    searchPlacement: "first-in-city",
    features: [
      "Everything in Free",
      "Build a weekly training schedule your whole klub follows - workouts, pace groups, and notes for every day",
      "Reusable workout library to build that schedule from in minutes",
      "Unlimited branches and locations",
      "Unlimited coaches",
      "Unlimited paid members",
      "20,000 newsletter & training-schedule emails included per month",
      "One-tap Instagram post from a ready-made template",
      "Event payments at Stripe fee + 1.9%",
      "First klub to show up in city search",
      "Free sponsor banners",
      "Priority placement in the sponsor & race network",
      "Access to race benefits & sponsors",
    ],
  },
}

export const PLAN_ORDER: PlanId[] = ["free", "pro"]
