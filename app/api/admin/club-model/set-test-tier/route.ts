import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { TEST_MANAGER_USER_ID } from "@/lib/clubModel/testAccounts"
import { CLUB_ID } from "@/lib/clubModel/constants"
import type { PlanId } from "@/lib/plans"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const VALID_TIERS = new Set<PlanId>(["free", "starter", "pro", "premium"])

// Test-only: lets the manager-dashboard tester flip the one seeded test
// club's billing tier to walk through what each plan unlocks, without a real
// Stripe checkout. Always targets the hardcoded CLUB_ID — never accepts a
// caller-supplied club id, so this can't be used to alter any other club's
// real billing tier.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const admin = getAdminSupabase()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await admin
      .from("profiles").select("role").eq("id", user.id).single()
    const isAdmin = profile?.role === "admin"
    const isManagerTester = user.id === TEST_MANAGER_USER_ID
    if (!isAdmin && !isManagerTester) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { tier } = await req.json()
    if (!VALID_TIERS.has(tier)) return NextResponse.json({ error: "Unknown tier" }, { status: 400 })

    const { error } = await admin.from("clubs").update({ tier }).eq("id", CLUB_ID)
    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true, tier })
  } catch (err: any) {
    console.error("set-test-tier error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
