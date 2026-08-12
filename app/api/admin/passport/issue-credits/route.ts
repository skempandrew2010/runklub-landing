import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Test-only: stands in for the Stripe billing-cycle webhook that doesn't
// exist yet (no live checkout for this product). Simulates "a subscriber's
// monthly billing date just hit" by issuing one credit batch. Real users
// never reach this — passport_issue_credits() is granted to service_role
// only, so it can't be called from the client even with a valid session.
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

    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: "user_id is required" }, { status: 400 })

    const { data: sub } = await admin
      .from("passport_subscriptions")
      .select("id")
      .eq("user_id", user_id)
      .eq("status", "active")
      .maybeSingle()
    if (!sub) return NextResponse.json({ error: "No active passport subscription for this user" }, { status: 404 })

    const { data: batchId, error } = await admin.rpc("passport_issue_credits", { p_subscription_id: sub.id })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: batch } = await admin
      .from("passport_credit_batches")
      .select("id, credits_issued, credits_remaining, issued_at, expires_at")
      .eq("id", batchId)
      .single()

    return NextResponse.json(batch)
  } catch (err: any) {
    console.error("issue-credits error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
