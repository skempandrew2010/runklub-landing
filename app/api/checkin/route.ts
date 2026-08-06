import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { performCheckIn } from "@/lib/server/checkin"

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const db = admin()
    const { data: { user }, error: authError } = await db.auth.getUser(authHeader.replace("Bearer ", ""))
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { run_id, selected_challenge_id } = await req.json()
    if (!run_id) return NextResponse.json({ error: "run_id required" }, { status: 400 })

    const result = await performCheckIn(db, {
      userId: user.id,
      runId: run_id,
      selectedChallengeId: selected_challenge_id ?? null,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    console.error("checkin error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
