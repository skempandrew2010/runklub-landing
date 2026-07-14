import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { TEST_MANAGER_USER_ID, TEST_MEMBER_USER_ID } from "@/lib/clubModel/testAccounts"
import { getClubModelTier, regionLimitForTier, coachLimitForTier } from "@/lib/clubModel/tierGate"
import { CLUB_ID } from "@/lib/clubModel/constants"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Only these prototype tables are reachable through this endpoint — never
// widen this to arbitrary table names, since it runs on the service-role key.
const ALLOWED_TABLES = new Set([
  "regions",
  "region_days",
  "region_day_times",
  "locations",
  "coaches",
  "location_coaches",
  "pace_groups",
  "pace_options",
  "training_schedules",
  "training_schedule_regions",
  "workout_types",
  "scheduled_workouts",
  "members",
  "club_model_invites",
  "run_rsvps",
])

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
    const isMemberTester = user.id === TEST_MEMBER_USER_ID
    if (!isAdmin && !isManagerTester && !isMemberTester) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const tier = await getClubModelTier(admin)
    if (!isAdmin && !tier) {
      return NextResponse.json({ error: "This club needs a Starter, Pro, or Premium plan" }, { status: 403 })
    }

    const { table, action, values, match, onConflict } = await req.json()
    if (!ALLOWED_TABLES.has(table)) return NextResponse.json({ error: "Unknown table" }, { status: 400 })

    // Starter can't add any regions at all; Pro is capped at one; Premium is
    // unlimited. Admins bypass (they may be testing without a real tier set).
    if (table === "regions" && action === "insert" && !isAdmin) {
      const limit = regionLimitForTier(tier)
      if (limit !== null) {
        const { count } = await admin.from("regions").select("*", { count: "exact", head: true }).eq("club_id", CLUB_ID)
        if ((count ?? 0) >= limit) {
          return NextResponse.json({ error: `Your plan is limited to ${limit} region${limit === 1 ? "" : "s"}` }, { status: 403 })
        }
      }
    }

    // Starter is capped at 2 coaches, Pro at 10, Premium is unlimited.
    if (table === "coaches" && action === "insert" && !isAdmin) {
      const limit = coachLimitForTier(tier)
      if (limit !== null) {
        const { count } = await admin.from("coaches").select("*", { count: "exact", head: true }).eq("club_id", CLUB_ID)
        if ((count ?? 0) >= limit) {
          return NextResponse.json({ error: `Your plan is limited to ${limit} coach${limit === 1 ? "" : "es"}` }, { status: 403 })
        }
      }
    }

    // The member test account can only insert its own signup row and manage
    // its own RSVPs — every other table/action here stays admin/manager-only.
    const memberTesterAllowed = (table === "members" && action === "insert")
      || (table === "run_rsvps" && ["insert", "update", "upsert"].includes(action))
    if (isMemberTester && !memberTesterAllowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (action === "insert") {
      const { data, error } = await admin.from(table).insert(values).select()
      if (error) throw new Error(error.message)
      return NextResponse.json({ data })
    }

    if (action === "delete") {
      if (!match || typeof match !== "object") return NextResponse.json({ error: "match required" }, { status: 400 })
      let query = admin.from(table).delete()
      for (const [col, val] of Object.entries(match)) query = query.eq(col, val as string)
      const { error } = await query
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    if (action === "update") {
      if (!match || typeof match !== "object") return NextResponse.json({ error: "match required" }, { status: 400 })
      let query = admin.from(table).update(values)
      for (const [col, val] of Object.entries(match)) query = query.eq(col, val as string)
      const { data, error } = await query.select()
      if (error) throw new Error(error.message)
      return NextResponse.json({ data })
    }

    if (action === "upsert") {
      if (!onConflict || typeof onConflict !== "string") {
        return NextResponse.json({ error: "onConflict required" }, { status: 400 })
      }
      const { data, error } = await admin.from(table).upsert(values, { onConflict }).select()
      if (error) throw new Error(error.message)
      return NextResponse.json({ data })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (err: any) {
    console.error("club-model mutate error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
