import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { regionLimitForTier, coachLimitForTier } from "@/lib/clubModel/tierGate"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Only these tables are reachable through this endpoint — never widen this to
// arbitrary table names since it runs on the service-role key.
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

    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single()
    const isAdmin = profile?.role === "admin"

    const body = await req.json()
    const { table, action, values, match, onConflict, clubId } = body

    if (!ALLOWED_TABLES.has(table)) return NextResponse.json({ error: "Unknown table" }, { status: 400 })

    let tier: string | null = null
    if (!isAdmin) {
      if (!clubId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      const { data: club } = await admin.from("clubs").select("id, tier").eq("id", clubId).eq("user_id", user.id).single()
      if (!club) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      if (!["starter", "growth", "enterprise"].includes(club.tier ?? "")) {
        return NextResponse.json({ error: "This club needs a Starter, Growth, or Enterprise plan" }, { status: 403 })
      }
      tier = club.tier
    }

    // Region limit check
    if (table === "regions" && action === "insert" && !isAdmin && clubId) {
      const limit = regionLimitForTier(tier as any)
      if (limit !== null) {
        const { count } = await admin.from("regions").select("*", { count: "exact", head: true }).eq("club_id", clubId)
        if ((count ?? 0) >= limit) {
          return NextResponse.json({ error: `Your plan is limited to ${limit} region${limit === 1 ? "" : "s"}` }, { status: 403 })
        }
      }
    }

    // Coach limit check
    if (table === "coaches" && action === "insert" && !isAdmin && clubId) {
      const limit = coachLimitForTier(tier as any)
      if (limit !== null) {
        const { count } = await admin.from("coaches").select("*", { count: "exact", head: true }).eq("club_id", clubId)
        if ((count ?? 0) >= limit) {
          return NextResponse.json({ error: `Your plan is limited to ${limit} coach${limit === 1 ? "" : "es"}` }, { status: 403 })
        }
      }
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
