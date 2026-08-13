import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!) }

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Runs passport_redeem_checkin() with the caller's own JWT (not the service
// role) so auth.uid() inside the function resolves to them — the same
// "can't spend someone else's credits" guarantee the function enforces at
// the database layer holds even though this route runs server-side.
function getSupabaseAsUser(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

// POST /api/passport/checkin — redeems Passport credits at a klub, then pays
// that klub via a Stripe Connect Transfer. The credit deduction (via the
// Postgres function) and the Transfer are deliberately not one atomic unit:
// if the klub's Connect account can't currently receive a transfer (not
// onboarded, payouts disabled), the runner still successfully spent their
// credits — that's a klub-side operational problem to resolve later, not
// something that should block the check-in itself. payout_status stays
// 'failed' until someone retries it; there's no retry job yet.
export async function POST(req: NextRequest) {
  try {
    const { club_id } = await req.json()
    if (!club_id) return NextResponse.json({ error: "club_id is required" }, { status: 400 })

    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userClient = getSupabaseAsUser(token)
    const { data: checkinId, error: rpcError } = await userClient.rpc("passport_redeem_checkin", { p_club_id: club_id })

    if (rpcError) {
      const status = rpcError.code === "28000" ? 401 : rpcError.code === "P0001" || rpcError.code === "P0002" ? 400 : 500
      return NextResponse.json({ error: rpcError.message }, { status })
    }

    const admin = getSupabaseAdmin()
    const { data: checkin } = await admin
      .from("passport_checkins")
      .select("id, club_id, credits_spent, payout_amount_cents, checkin_tier")
      .eq("id", checkinId)
      .single()

    if (!checkin) {
      // Should be unreachable — the RPC just created this row — but don't
      // pretend a payout happened if we somehow can't find it.
      return NextResponse.json({ error: "Check-in recorded but could not be loaded" }, { status: 500 })
    }

    const { data: club } = await admin
      .from("clubs")
      .select("id, name, stripe_connect_account_id, stripe_connect_payouts_enabled")
      .eq("id", checkin.club_id)
      .single()

    let payoutStatus: "paid" | "failed" = "failed"
    let transferId: string | null = null

    if (club?.stripe_connect_account_id && club.stripe_connect_payouts_enabled && checkin.payout_amount_cents > 0) {
      try {
        const transfer = await getStripe().transfers.create(
          {
            amount: checkin.payout_amount_cents,
            currency: "usd",
            destination: club.stripe_connect_account_id,
            metadata: { checkinId: checkin.id, clubId: checkin.club_id },
          },
          // Ties retries of this same check-in to the same Transfer instead
          // of paying the klub twice.
          { idempotencyKey: `passport-checkin-${checkin.id}` }
        )
        payoutStatus = "paid"
        transferId = transfer.id
      } catch (transferErr) {
        console.error(`Passport payout transfer failed for check-in ${checkin.id}:`, transferErr)
      }
    } else {
      console.error(`Passport check-in ${checkin.id}: klub ${checkin.club_id} has no usable Connect account for payout`)
    }

    await admin.from("passport_checkins").update({ payout_status: payoutStatus, stripe_transfer_id: transferId }).eq("id", checkin.id)

    return NextResponse.json({
      checkinId: checkin.id,
      clubId: checkin.club_id,
      clubName: club?.name ?? "Klub",
      checkinTier: checkin.checkin_tier,
      creditsSpent: checkin.credits_spent,
      payoutCents: checkin.payout_amount_cents,
      payoutStatus,
    })
  } catch (err) {
    console.error("Passport checkin error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
