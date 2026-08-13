import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Test-only: manually triggers passport_issue_monthly_credits_for_yearly_subs(),
// the same function the daily pg_cron job runs, so the yearly-subscriber
// monthly-credit path can be tested without waiting for next_credit_issue_at
// to actually pass and a real cron tick to fire.
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

    const { data: count, error } = await admin.rpc("passport_issue_monthly_credits_for_yearly_subs")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ issuedCount: count })
  } catch (err: any) {
    console.error("run-yearly-cron error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
