import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!) }

// Tables with a plain `user_id` column and no DB-level cascade from
// auth.users/profiles (confirmed via information_schema - only
// club_claims/run_chats/user_badges cascade automatically off profiles.id,
// so they're deleted implicitly when the profiles row goes). Deleted before
// profiles/auth.users so nothing is left orphaned.
const USER_SCOPED_TABLES = [
  "checkin_log",
  "city_checkins",
  "club_checkins",
  "coaches",
  "members",
  "membership_requests",
  "notifications",
  "passport_credit_batches",
  "passport_redemptions",
  "passport_runner_credit_balances",
  "passport_runner_state_badges",
  "passport_subscriptions",
  "passport_waitlist",
  "rsvps",
  "run_checkins",
  "runner_club_history",
  "subscriptions",
  "user_challenge_progress",
  "waiver_acknowledgments",
]

// POST /api/account/delete - permanently deletes the calling user's own
// account and every row scoped to them. Requires a typed "DELETE"
// confirmation (not a password, since Google-only accounts have none) and
// refuses if the user still owns a klub, so a director's community doesn't
// silently disappear.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const admin = getAdminSupabase()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { confirmation } = await req.json()
    if (confirmation !== "DELETE") {
      return NextResponse.json({ error: 'Type "DELETE" to confirm.' }, { status: 400 })
    }

    const { data: ownedClubs } = await admin
      .from("clubs")
      .select("name")
      .eq("user_id", user.id)

    if (ownedClubs && ownedClubs.length > 0) {
      const names = ownedClubs.map((c) => c.name).join(", ")
      return NextResponse.json(
        { error: `You own ${names}. Delete or transfer it before deleting your account.`, code: "owns_club" },
        { status: 400 }
      )
    }

    const { data: passportSub } = await admin
      .from("passport_subscriptions")
      .select("stripe_subscription_id, status")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing"])
      .maybeSingle()

    if (passportSub?.stripe_subscription_id) {
      try {
        await getStripe().subscriptions.cancel(passportSub.stripe_subscription_id)
      } catch (err) {
        console.error("account delete: passport subscription cancel error:", err)
      }
    }

    for (const table of USER_SCOPED_TABLES) {
      const { error } = await admin.from(table).delete().eq("user_id", user.id)
      if (error) console.error(`account delete: failed clearing ${table}:`, error.message)
    }

    await admin.from("profiles").delete().eq("id", user.id)

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteUserError) throw new Error(deleteUserError.message)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("account delete error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
