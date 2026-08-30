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

// Runs passport_redeem_offer() with the caller's own JWT (not the service
// role) so auth.uid() inside the function resolves to them - the same
// "can't spend someone else's credits" guarantee the function enforces at
// the database layer holds even though this route runs server-side.
function getSupabaseAsUser(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

// POST /api/passport/redeem - redeems Passport credits against a klub's
// offer, then pays that klub via a Stripe Connect Transfer. The credit
// deduction (via the Postgres function) and the Transfer are deliberately
// not one atomic unit: if the klub's Connect account can't currently
// receive a transfer (not onboarded, payouts disabled), the runner still
// successfully redeemed the offer - that's a klub-side operational problem
// to resolve later, not something that should block the redemption itself.
// payout_status stays 'failed' until the retry cron (app/api/cron/
// retry-passport-payouts) picks it back up.
export async function POST(req: NextRequest) {
  try {
    const { offer_id, run_id, checkin_method, checkin_lat, checkin_lng, external_reference } = await req.json()
    if (!offer_id) return NextResponse.json({ error: "offer_id is required" }, { status: 400 })

    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userClient = getSupabaseAsUser(token)
    const { data: redemptionId, error: rpcError } = await userClient.rpc("passport_redeem_offer", {
      p_offer_id: offer_id,
      p_run_id: run_id ?? null,
      p_checkin_method: checkin_method ?? "no_checkin_required",
      p_checkin_lat: checkin_lat ?? null,
      p_checkin_lng: checkin_lng ?? null,
      p_external_reference: external_reference ?? null,
    })

    if (rpcError) {
      const status = rpcError.code === "28000" ? 401 : rpcError.code === "P0001" || rpcError.code === "P0002" ? 400 : 500
      return NextResponse.json({ error: rpcError.message }, { status })
    }

    const admin = getSupabaseAdmin()
    const { data: redemption } = await admin
      .from("passport_redemptions")
      .select("id, club_id, offer_id, credits_spent, payout_amount_cents")
      .eq("id", redemptionId)
      .single()

    if (!redemption) {
      // Should be unreachable - the RPC just created this row - but don't
      // pretend a payout happened if we somehow can't find it.
      return NextResponse.json({ error: "Redemption recorded but could not be loaded" }, { status: 500 })
    }

    const { data: club } = await admin
      .from("clubs")
      .select("id, name, stripe_connect_account_id, stripe_connect_payouts_enabled, passport_program_enrolled")
      .eq("id", redemption.club_id)
      .single()

    let payoutStatus: "paid" | "failed" = "failed"
    let transferId: string | null = null

    if (club?.passport_program_enrolled && club.stripe_connect_account_id && club.stripe_connect_payouts_enabled && redemption.payout_amount_cents > 0) {
      try {
        const transfer = await getStripe().transfers.create(
          {
            amount: redemption.payout_amount_cents,
            currency: "usd",
            destination: club.stripe_connect_account_id,
            metadata: { redemptionId: redemption.id, offerId: redemption.offer_id, clubId: redemption.club_id },
          },
          // Ties retries of this same redemption to the same Transfer instead
          // of paying the klub twice.
          { idempotencyKey: `passport-redemption-${redemption.id}` }
        )
        payoutStatus = "paid"
        transferId = transfer.id
      } catch (transferErr) {
        console.error(`Passport payout transfer failed for redemption ${redemption.id}:`, transferErr)
      }
    } else {
      console.error(`Passport redemption ${redemption.id}: klub ${redemption.club_id} has no usable Connect account for payout`)
    }

    await admin.from("passport_redemptions").update({ payout_status: payoutStatus, stripe_transfer_id: transferId }).eq("id", redemption.id)

    return NextResponse.json({
      redemptionId: redemption.id,
      clubId: redemption.club_id,
      clubName: club?.name ?? "Klub",
      creditsSpent: redemption.credits_spent,
      payoutCents: redemption.payout_amount_cents,
      payoutStatus,
    })
  } catch (err) {
    console.error("Passport redeem error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
