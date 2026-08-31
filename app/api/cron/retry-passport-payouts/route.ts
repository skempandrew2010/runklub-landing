import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!) }

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// A Passport redemption's Stripe transfer can fail for reasons that clear up
// on their own (a klub finishes Connect onboarding, a transient Stripe
// error) - this sweeps every redemption still marked payout_status='failed'
// and retries the transfer, keyed on the same idempotency key the original
// attempt used so a since-fixed account never gets paid twice for one
// redemption.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = getAdminSupabase()

  const { data: failed, error } = await admin
    .from("passport_redemptions")
    .select("id, club_id, payout_amount_cents, offer_id, clubs(stripe_connect_account_id, stripe_connect_payouts_enabled, passport_program_enrolled)")
    .eq("payout_status", "failed")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let retried = 0
  let stillFailed = 0

  for (const redemption of failed ?? []) {
    const club = redemption.clubs as unknown as { stripe_connect_account_id: string | null; stripe_connect_payouts_enabled: boolean; passport_program_enrolled: boolean } | null
    if (!club?.passport_program_enrolled || !club.stripe_connect_account_id || !club.stripe_connect_payouts_enabled || redemption.payout_amount_cents <= 0) {
      stillFailed++
      continue
    }

    try {
      const transfer = await getStripe().transfers.create(
        {
          amount: redemption.payout_amount_cents,
          currency: "usd",
          destination: club.stripe_connect_account_id,
          metadata: { redemptionId: redemption.id, offerId: redemption.offer_id, clubId: redemption.club_id },
        },
        { idempotencyKey: `passport-redemption-${redemption.id}` }
      )
      await admin.from("passport_redemptions").update({ payout_status: "paid", stripe_transfer_id: transfer.id }).eq("id", redemption.id)
      retried++
    } catch (err) {
      console.error(`retry-passport-payouts: still failing for redemption ${redemption.id}:`, err)
      stillFailed++
    }
  }

  return NextResponse.json({ ok: true, retried, stillFailed })
}
