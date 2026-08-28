import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { PLANS, type PlanId } from "@/lib/plans"

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!) }

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/clubs/[clubId]/subscribe - creates a Checkout Session for a
// runner to pay for one of the klub's named membership plans (director's
// own custom lineup - could be "Monthly", "Yearly", "Student Rate", a
// "Summer Season" plan covering a specific calendar range, whatever they've
// set up). Monthly/yearly are real recurring Stripe subscriptions; seasonal
// is a one-time payment tied to the plan's fixed season_end_date, with no
// auto-renewal and no Stripe subscription object at all. Everything here
// runs inside the connected account's own namespace ({ stripeAccount }) so the resulting
// Customer/Subscription-or-PaymentIntent/Charge belong to the klub, not
// RunKlub - that's what actually routes the money there. The
// application_fee_percent/application_fee_amount is RunKlub's cut, scaled
// by the klub's SaaS tier.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params
    const { planId, paceGroupId, selfReportedPace, raceDistance, raceTimeSeconds } = await req.json().catch(() => ({ planId: undefined }))

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!planId || !UUID_RE.test(planId)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
    }

    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = getSupabaseAdmin()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: club } = await admin
      .from("clubs")
      .select("id, name, tier, membership_currency, stripe_connect_account_id, stripe_connect_charges_enabled")
      .eq("id", clubId)
      .single()
    if (!club) return NextResponse.json({ error: "Klub not found" }, { status: 404 })

    const { data: plan } = await admin
      .from("club_membership_plans")
      .select("id, name, price_cents, billing_interval, season_start_date, season_end_date, is_active")
      .eq("id", planId)
      .eq("club_id", clubId)
      .eq("is_active", true)
      .single()

    if (!plan || !club.stripe_connect_account_id || !club.stripe_connect_charges_enabled) {
      return NextResponse.json({ error: "This klub isn't accepting paid memberships right now" }, { status: 400 })
    }
    const isSeasonal = plan.billing_interval === "seasonal"
    if (isSeasonal && plan.season_end_date && plan.season_end_date < new Date().toISOString().slice(0, 10)) {
      return NextResponse.json({ error: "This season has already ended" }, { status: 400 })
    }

    const { data: existingSub } = await admin
      .from("subscriptions")
      .select("id, member_type, stripe_customer_id, stripe_subscription_id, expires_at")
      .eq("user_id", user.id)
      .eq("club_id", clubId)
      .maybeSingle()

    const alreadyPaid = existingSub?.member_type === "paid" && (
      !!existingSub.stripe_subscription_id ||
      (existingSub.expires_at ? new Date(existingSub.expires_at) > new Date() : false)
    )
    if (alreadyPaid) {
      return NextResponse.json({ error: "You're already a paying member of this klub" }, { status: 400 })
    }

    const stripe = getStripe()
    const stripeAccount = club.stripe_connect_account_id

    let customerId = existingSub?.stripe_customer_id ?? undefined

    if (customerId) {
      // Don't trust our own DB alone - a failed/delayed webhook could leave
      // it stale while Stripe already has an active subscription for them.
      // Only meaningful for recurring plans; a one-time seasonal payment has
      // no ongoing Stripe subscription object to check.
      if (!isSeasonal) {
        const existing = await stripe.subscriptions.list(
          { customer: customerId, status: "active", limit: 1 },
          { stripeAccount }
        )
        if (existing.data.length > 0) {
          return NextResponse.json({ error: "You're already a paying member of this klub" }, { status: 400 })
        }
      }
    } else {
      const customer = await stripe.customers.create(
        { email: user.email, metadata: { userId: user.id, clubId } },
        { stripeAccount }
      )
      customerId = customer.id
    }

    const saasPlan = PLANS[(club.tier as PlanId) ?? "free"] ?? PLANS.free
    const feePct = saasPlan.paymentFeeSurchargePct ?? PLANS.free.paymentFeeSurchargePct!

    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const metadata = {
      clubId,
      userId: user.id,
      planId: plan.id,
      planName: plan.name,
      billingInterval: plan.billing_interval,
      priceCents: String(plan.price_cents),
      ...(isSeasonal ? { seasonEndDate: plan.season_end_date! } : {}),
      // Optional -- only set when the runner went through the pace-match
      // modal on the club page (Stripe drops undefined/null metadata values,
      // so these are only included when actually present).
      ...(paceGroupId ? { paceGroupId: String(paceGroupId) } : {}),
      ...(selfReportedPace != null ? { selfReportedPace: String(selfReportedPace) } : {}),
      ...(raceDistance ? { raceDistance: String(raceDistance) } : {}),
      ...(raceTimeSeconds != null ? { raceTimeSeconds: String(raceTimeSeconds) } : {}),
    }

    const session = await stripe.checkout.sessions.create(
      isSeasonal
        ? {
            mode: "payment",
            customer: customerId,
            line_items: [{
              price_data: {
                currency: club.membership_currency ?? "usd",
                unit_amount: plan.price_cents,
                product_data: { name: `${club.name} - ${plan.name}` },
              },
              quantity: 1,
            }],
            payment_intent_data: {
              application_fee_amount: Math.round((plan.price_cents * feePct) / 100),
              metadata,
            },
            metadata,
            success_url: `${appUrl}/clubs/${clubId}?subscribed=1`,
            cancel_url: `${appUrl}/clubs/${clubId}?subscribe_cancelled=1`,
          }
        : {
            mode: "subscription",
            customer: customerId,
            line_items: [{
              price_data: {
                currency: club.membership_currency ?? "usd",
                unit_amount: plan.price_cents,
                recurring: { interval: plan.billing_interval === "yearly" ? "year" : "month" },
                product_data: { name: `${club.name} - ${plan.name}` },
              },
              quantity: 1,
            }],
            subscription_data: {
              application_fee_percent: feePct,
              metadata,
            },
            metadata,
            success_url: `${appUrl}/clubs/${clubId}?subscribed=1`,
            cancel_url: `${appUrl}/clubs/${clubId}?subscribe_cancelled=1`,
          },
      { stripeAccount }
    )

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error("Klub membership checkout error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
