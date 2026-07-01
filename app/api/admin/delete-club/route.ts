import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
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

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await getAdminSupabase().auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await getAdminSupabase()
      .from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { club_id, password } = await req.json()
    if (!club_id || !password) return NextResponse.json({ error: "club_id and password required" }, { status: 400 })

    // Re-authenticate to verify the admin's password before a destructive action
    const publicClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { error: signInError } = await publicClient.auth.signInWithPassword({
      email: user.email!,
      password,
    })
    if (signInError) return NextResponse.json({ error: "Incorrect password" }, { status: 401 })

    // Delete child rows first to satisfy FK constraints
    await getAdminSupabase().from("runs").delete().eq("club_id", club_id)
    await getAdminSupabase().from("club_claims").delete().eq("club_id", club_id)
    await getAdminSupabase().from("subscriptions").delete().eq("club_id", club_id)
    const { error: deleteError } = await getAdminSupabase().from("clubs").delete().eq("id", club_id)
    if (deleteError) throw new Error(deleteError.message)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("delete-club error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
