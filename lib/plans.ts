// Canonical source of truth for RunKlub's director-facing SaaS plans. This is
// the `clubs.tier` field's full value set (extending the pro/premium check in
// lib/clubModel/tierGate.ts) plus every price and limit tied to each tier.
// Nothing here is enforced automatically just by existing in this file -
// each limit still needs its own check wired in wherever it applies (see
// lib/clubModel/tierGate.ts for the one built so far: region caps).

export type PlanId = "free" | "starter" | "growth" | "enterprise"
export type BillingInterval = "monthly" | "yearly"
export type EmailCadence = "none" | "weekly" | "3x-week" | "daily"
export type SearchPlacement = "standard" | "priority-verified" | "first-in-city"
export type SponsorRaceNetworkAccess = "none" | "standard" | "priority"

export type Plan = {
  id: PlanId
  name: string
  tagline: string | null
  // null = free, no billing at all.
  price: { monthly: number; yearly: number } | null
  // null = unlimited. Total member count for the klub (every subscriptions
  // row, paid or free/community) - enforced in lib/memberCap.ts wherever a
  // new member could be added. Free stays unlimited since those members
  // never pay anything; klubs over the Enterprise ceiling need custom
  // pricing (sales-negotiated, not modeled as a plan here).
  memberLimit: number | null
  // Whether the club can charge its own members to join (clubs.membership_type
  // = optional_paid/paid_required). Free clubs can only ever be free to join -
  // paid tiers unlock charging for club membership itself, separate from
  // charging for individual events (which every tier, including Free, can do).
  clubMembershipPaymentsAllowed: boolean
  // 0 = no access to the club-management (region/coach/schedule) system.
  // 1 = capped at one region (Pro). null = unlimited regions (Premium).
  regionLimit: number | null
  // Whether locations are the simple single-weekly-location model (Starter)
  // instead of the full region/schedule system (Pro/Premium, regionLimit > 0).
  singleWeeklyLocationOnly: boolean
  coachLimit: number | null
  eventLimit: number | null
  // Added on top of Stripe's own processing fee, for event ticket payments.
  // null = not yet defined by the business - do not assume a number here.
  paymentFeeSurchargePct: number | null
  emailCadence: EmailCadence
  instagramAutoPost: boolean
  chat: boolean
  pushNotifications: boolean
  raceBenefitsAccess: boolean
  sponsorBannersFree: boolean
  sponsorRaceNetworkAccess: SponsorRaceNetworkAccess
  searchPlacement: SearchPlacement
  // Verified badge is included as long as the club keeps paying for this
  // plan; it disappears if they cancel, unless they've also bought the
  // separate one-time $49 lifetime verification (tracked independently of
  // tier - not modeled here yet).
  verificationIncludedWhileSubscribed: boolean
  // Display bullets for the pricing page, in order.
  features: string[]
}

export const LIFETIME_VERIFICATION_PRICE = 49

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: null,
    price: null,
    memberLimit: null,
    clubMembershipPaymentsAllowed: false,
    regionLimit: 0,
    singleWeeklyLocationOnly: false,
    coachLimit: 0,
    eventLimit: null,
    paymentFeeSurchargePct: 4,
    emailCadence: "none",
    instagramAutoPost: false,
    chat: true,
    pushNotifications: true,
    raceBenefitsAccess: false,
    sponsorBannersFree: false,
    sponsorRaceNetworkAccess: "none",
    searchPlacement: "standard",
    verificationIncludedWhileSubscribed: false,
    features: [
      "Unlimited community members",
      "Chat with your klub members",
      "Post free or paid community events, open to everyone",
      "Push notifications remind members of upcoming runs",
      "Accept event payments (Stripe fee + 4%) - klub membership itself always stays free",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "Best for klubs just starting out",
    price: { monthly: 24.99, yearly: 249.99 },
    memberLimit: 100,
    clubMembershipPaymentsAllowed: true,
    regionLimit: 0,
    singleWeeklyLocationOnly: true,
    coachLimit: 4,
    eventLimit: null,
    paymentFeeSurchargePct: 3,
    emailCadence: "weekly",
    instagramAutoPost: true,
    chat: true,
    pushNotifications: true,
    raceBenefitsAccess: true,
    sponsorBannersFree: false,
    sponsorRaceNetworkAccess: "none",
    searchPlacement: "standard",
    verificationIncludedWhileSubscribed: true,
    features: [
      "Everything in Free",
      "Weekly email reminder of the week's runs",
      "One-tap Instagram post from a ready-made template",
      "One weekly location (no regions yet)",
      "Event payments at Stripe fee + 3%",
      "Optionally charge members to join your klub",
      "Up to 100 members",
      "Up to 4 coaches",
      "Access to race benefits & sponsors",
      "Verified badge included while subscribed",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    tagline: null,
    price: { monthly: 49.99, yearly: 499.99 },
    memberLimit: 250,
    clubMembershipPaymentsAllowed: true,
    regionLimit: 1,
    singleWeeklyLocationOnly: false,
    coachLimit: 10,
    eventLimit: null,
    paymentFeeSurchargePct: 2,
    emailCadence: "3x-week",
    instagramAutoPost: true,
    chat: true,
    pushNotifications: true,
    raceBenefitsAccess: true,
    sponsorBannersFree: true,
    sponsorRaceNetworkAccess: "standard",
    searchPlacement: "priority-verified",
    verificationIncludedWhileSubscribed: true,
    features: [
      "Everything in Starter",
      "One branch, unlimited locations (upgrade to Enterprise for multiple branches)",
      "Klub update emails 3x a week",
      "Event payments at Stripe fee + 2%",
      "Up to 250 members",
      "Up to 10 coaches",
      "Priority verified placement",
      "Free sponsor banners",
      "Access to the sponsor & race network",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tagline: null,
    price: { monthly: 99.99, yearly: 999.99 },
    memberLimit: 500,
    clubMembershipPaymentsAllowed: true,
    regionLimit: null,
    singleWeeklyLocationOnly: false,
    coachLimit: null,
    eventLimit: null,
    paymentFeeSurchargePct: 1,
    emailCadence: "daily",
    instagramAutoPost: true,
    chat: true,
    pushNotifications: true,
    raceBenefitsAccess: true,
    sponsorBannersFree: true,
    sponsorRaceNetworkAccess: "priority",
    searchPlacement: "first-in-city",
    verificationIncludedWhileSubscribed: true,
    features: [
      "Everything in Growth",
      "Up to 500 members",
      "Daily email updates for members",
      "Event payments at Stripe fee + 1%",
      "First klub to show up in city search",
      "Free verification",
      "Free sponsor banners",
      "Priority placement in the sponsor & race network",
      "Unlimited events",
      "Unlimited coaches",
      "Unlimited branches",
    ],
  },
}

export const PLAN_ORDER: PlanId[] = ["free", "starter", "growth", "enterprise"]

// Enterprise (500) is the highest number we sell as a fixed plan. Klubs that
// outgrow it need a sales-negotiated custom plan rather than a self-serve tier.
export const CUSTOM_PRICING_MESSAGE =
  "Need more than 500 members? Contact us for custom pricing."
