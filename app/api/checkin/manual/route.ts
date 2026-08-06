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

/** Lets a klub owner/coach check a member in directly — for members who can't self check-in via geolocation. */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const db = admin()
    const { data: { user: caller }, error: authError } = await db.auth.getUser(authHeader.replace("Bearer ", ""))
    if (authError || !caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { run_id, user_id } = await req.json()
    if (!run_id || !user_id) return NextResponse.json({ error: "run_id and user_id required" }, { status: 400 })

    const { data: run } = await db.from("runs").select("id, club_id").eq("id", run_id).single()
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 })

    const [{ data: ownedClub }, { data: coachRow }] = await Promise.all([
      db.from("clubs").select("id").eq("id", run.club_id).eq("user_id", caller.id).maybeSingle(),
      db.from("coaches").select("id").eq("club_id", run.club_id).eq("user_id", caller.id).maybeSingle(),
    ])
    if (!ownedClub && !coachRow) {
      return NextResponse.json({ error: "Not authorized to check members into this klub's runs" }, { status: 403 })
    }

    const result = await performCheckIn(db, {
      userId: user_id,
      runId: run_id,
      checkedInBy: caller.id,
      checkinMethod: "manual",
    })

    return NextResponse.json(result)
  } catch (err: any) {
    console.error("manual checkin error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
