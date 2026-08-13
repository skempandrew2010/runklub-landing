import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Interval = "monthly" | "yearly" | "seasonal"

const PRICE_RANGES: Record<Interval, { min: number; max: number }> = {
  monthly: { min: 300, max: 100000 },
  yearly: { min: 300, max: 1000000 },
  seasonal: { min: 300, max: 1000000 },
}

function resolveInterval(billingInterval: unknown): Interval {
  return billingInterval === "yearly" ? "yearly" : billingInterval === "seasonal" ? "seasonal" : "monthly"
}

const MONTH_RE = /^\d{4}-\d{2}$/

// "2026-06" -> "2026-06-01" (first day of that month)
function monthToStartDate(month: string): string {
  return `${month}-01`
}

// "2026-08" -> "2026-08-31" (last day of that month) via day 0 of the next month
function monthToEndDate(month: string): string {
  const [year, mon] = month.split("-").map(Number)
  return new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10)
}

async function getAuthedUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return null
  const admin = getSupabaseAdmin()
  const { data: { user } } = await admin.auth.getUser(token)
  return user
}

// POST /api/director/connect/membership-plans — creates a named custom
// membership plan (e.g. "Student Rate", "Family Plan", a "Summer Season"
// plan covering June-August) for a klub. A klub can have any number of
// active plans at once, in any mix of monthly/yearly/seasonal — runners
// pick whichever they want on the klub page. Seasonal plans are a one-time
// payment (not a recurring Stripe subscription) tied to a real calendar
// range the director picks — everyone who joins a given season shares the
// same end date, unlike a rolling "N months from signup" window — handled
// entirely in the subscribe route / webhook, not here.
export async function POST(req: NextRequest) {
  try {
    const { clubId, name, priceCents, billingInterval, seasonStartMonth, seasonEndMonth } = await req.json()

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!clubId || !UUID_RE.test(clubId)) return NextResponse.json({ error: "Invalid klub ID" }, { status: 400 })

    const trimmedName = String(name ?? "").trim()
    if (!trimmedName || trimmedName.length > 60) {
      return NextResponse.json({ error: "Plan name must be 1-60 characters" }, { status: 400 })
    }

    const interval = resolveInterval(billingInterval)
    const range = PRICE_RANGES[interval]
    if (!Number.isInteger(priceCents) || priceCents < range.min || priceCents > range.max) {
      return NextResponse.json({ error: `Price must be between $${(range.min / 100).toFixed(2)} and $${(range.max / 100).toFixed(2)}` }, { status: 400 })
    }

    let seasonStartDate: string | null = null
    let seasonEndDate: string | null = null
    if (interval === "seasonal") {
      if (!MONTH_RE.test(seasonStartMonth ?? "") || !MONTH_RE.test(seasonEndMonth ?? "")) {
        return NextResponse.json({ error: "Pick a start and end month" }, { status: 400 })
      }
      seasonStartDate = monthToStartDate(seasonStartMonth)
      seasonEndDate = monthToEndDate(seasonEndMonth)
      if (seasonEndDate <= seasonStartDate) {
        return NextResponse.json({ error: "End month must be after the start month" }, { status: 400 })
      }
    }

    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = getSupabaseAdmin()
    const { data: club } = await admin
      .from("clubs")
      .select("id, membership_type, stripe_connect_charges_enabled")
      .eq("id", clubId)
      .eq("user_id", user.id)
      .single()
    if (!club) return NextResponse.json({ error: "Klub not found" }, { status: 404 })
    if (!club.stripe_connect_charges_enabled) {
      return NextResponse.json({ error: "Finish connecting Stripe before adding a paid plan" }, { status: 400 })
    }

    const { data: plan, error } = await admin
      .from("club_membership_plans")
      .insert({ club_id: clubId, name: trimmedName, price_cents: priceCents, billing_interval: interval, season_start_date: seasonStartDate, season_end_date: seasonEndDate })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (club.membership_type === "free") {
      await admin.from("clubs").update({ membership_type: "paid_required" }).eq("id", clubId)
    }
    await admin
      .from("membership_requests")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("club_id", clubId)
      .eq("status", "pending")

    return NextResponse.json(plan)
  } catch (err) {
    console.error("Create membership plan error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/director/connect/membership-plans — rename/reprice/toggle a
// plan. Existing members keep whatever they signed up under (snapshotted on
// their subscriptions row), so editing here only affects new signups.
export async function PATCH(req: NextRequest) {
  try {
    const { planId, name, priceCents, billingInterval, seasonStartMonth, seasonEndMonth, isActive } = await req.json()
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!planId || !UUID_RE.test(planId)) return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 })

    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = getSupabaseAdmin()
    const { data: plan } = await admin
      .from("club_membership_plans")
      .select("id, club_id, billing_interval, clubs!inner(user_id)")
      .eq("id", planId)
      .single()
    if (!plan || (plan as any).clubs.user_id !== user.id) return NextResponse.json({ error: "Plan not found" }, { status: 404 })

    const updates: Record<string, unknown> = {}
    if (name !== undefined) {
      const trimmedName = String(name).trim()
      if (!trimmedName || trimmedName.length > 60) return NextResponse.json({ error: "Plan name must be 1-60 characters" }, { status: 400 })
      updates.name = trimmedName
    }
    const interval = billingInterval !== undefined ? resolveInterval(billingInterval) : (plan.billing_interval as Interval)
    if (billingInterval !== undefined) updates.billing_interval = interval
    if (priceCents !== undefined) {
      const range = PRICE_RANGES[interval]
      if (!Number.isInteger(priceCents) || priceCents < range.min || priceCents > range.max) {
        return NextResponse.json({ error: `Price must be between $${(range.min / 100).toFixed(2)} and $${(range.max / 100).toFixed(2)}` }, { status: 400 })
      }
      updates.price_cents = priceCents
    }
    if (seasonStartMonth !== undefined || seasonEndMonth !== undefined) {
      if (interval !== "seasonal") return NextResponse.json({ error: "Season dates only apply to seasonal plans" }, { status: 400 })
      if (!MONTH_RE.test(seasonStartMonth ?? "") || !MONTH_RE.test(seasonEndMonth ?? "")) {
        return NextResponse.json({ error: "Pick a start and end month" }, { status: 400 })
      }
      const seasonEndDate = monthToEndDate(seasonEndMonth)
      const seasonStartDate = monthToStartDate(seasonStartMonth)
      if (seasonEndDate <= seasonStartDate) return NextResponse.json({ error: "End month must be after the start month" }, { status: 400 })
      updates.season_start_date = seasonStartDate
      updates.season_end_date = seasonEndDate
    }
    if (isActive !== undefined) updates.is_active = !!isActive

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

    const { data: updated, error } = await admin.from("club_membership_plans").update(updates).eq("id", planId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(updated)
  } catch (err) {
    console.error("Update membership plan error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/director/connect/membership-plans?planId= — archives (does not
// hard-delete) a plan, so existing members' plan_name snapshot stays
// meaningful and nothing references a vanished row. Just stops it from
// being offered to new signups.
export async function DELETE(req: NextRequest) {
  try {
    const planId = req.nextUrl.searchParams.get("planId")
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!planId || !UUID_RE.test(planId)) return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 })

    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = getSupabaseAdmin()
    const { data: plan } = await admin
      .from("club_membership_plans")
      .select("id, clubs!inner(user_id)")
      .eq("id", planId)
      .single()
    if (!plan || (plan as any).clubs.user_id !== user.id) return NextResponse.json({ error: "Plan not found" }, { status: 404 })

    await admin.from("club_membership_plans").update({ is_active: false }).eq("id", planId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Archive membership plan error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
