import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Test-only: there's no live Stripe checkout for Passport credits yet, so
// this is the only way to get a passport_subscriptions row to test against.
// Creates one with no stripe_subscription_id — never touches Stripe.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const admin = getAdminSupabase()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { user_id, tier } = await req.json()
    if (!user_id || ![1, 2, 3, 4].includes(tier)) {
      return NextResponse.json({ error: "user_id and tier (1-4) are required" }, { status: 400 })
    }

    const { data: existing } = await admin
      .from("passport_subscriptions")
      .select("id")
      .eq("user_id", user_id)
      .eq("status", "active")
      .maybeSingle()

    if (existing) {
      const { data: updated, error } = await admin
        .from("passport_subscriptions")
        .update({ tier })
        .eq("id", existing.id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(updated)
    }

    const { data: created, error } = await admin
      .from("passport_subscriptions")
      .insert({ user_id, tier, status: "active" })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(created)
  } catch (err: any) {
    console.error("create-test-subscription error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
