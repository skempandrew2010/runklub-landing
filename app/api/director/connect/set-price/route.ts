import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const MIN_PRICE_CENTS = 300
const MAX_PRICE_CENTS = 100000

// POST /api/director/connect/set-price — sets or clears a klub's monthly
// membership price. Setting a price for the first time flips membership_type
// to paid_required (a price on a still-public klub would never be reachable)
// and supersedes any pending free-approval requests, since paying replaces
// that flow entirely once a price exists. Clearing a price is blocked while
// any member has a live Stripe subscription — cancel them first rather than
// silently orphaning it.
export async function POST(req: NextRequest) {
  try {
    const { clubId, priceCents } = await req.json()

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!clubId || !UUID_RE.test(clubId)) {
      return NextResponse.json({ error: "Invalid klub ID" }, { status: 400 })
    }

    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = getSupabaseAdmin()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: club } = await admin
      .from("clubs")
      .select("id, membership_type, stripe_connect_charges_enabled")
      .eq("id", clubId)
      .eq("user_id", user.id)
      .single()

    if (!club) return NextResponse.json({ error: "Klub not found" }, { status: 404 })

    if (priceCents === null) {
      const { count } = await admin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId)
        .eq("member_type", "paid")
        .not("stripe_subscription_id", "is", null)

      if ((count ?? 0) > 0) {
        return NextResponse.json(
          { error: "Cancel active paying members' subscriptions before removing the price" },
          { status: 400 }
        )
      }

      await admin.from("clubs").update({ membership_price_cents: null }).eq("id", clubId)
      return NextResponse.json({ ok: true })
    }

    if (!Number.isInteger(priceCents) || priceCents < MIN_PRICE_CENTS || priceCents > MAX_PRICE_CENTS) {
      return NextResponse.json({ error: "Price must be between $3.00 and $1,000.00" }, { status: 400 })
    }

    if (!club.stripe_connect_charges_enabled) {
      return NextResponse.json({ error: "Finish connecting Stripe before setting a price" }, { status: 400 })
    }

    const updates: Record<string, unknown> = { membership_price_cents: priceCents }
    if (club.membership_type === "free") updates.membership_type = "paid_required"
    await admin.from("clubs").update(updates).eq("id", clubId)

    await admin
      .from("membership_requests")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("club_id", clubId)
      .eq("status", "pending")

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Stripe Connect set-price error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
