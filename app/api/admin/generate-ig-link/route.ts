import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const BASE_URL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.runklub.fit"

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

    const { club_id, instagram_handle } = await req.json()
    if (!club_id) return NextResponse.json({ error: "club_id required" }, { status: 400 })

    const { data: club, error: lookupError } = await getAdminSupabase()
      .from("clubs")
      .select("claim_token")
      .eq("id", club_id)
      .single()

    if (lookupError || !club) return NextResponse.json({ error: "Club not found" }, { status: 404 })

    // Reuse the existing token — only generate a new one if there isn't one yet.
    // Generating a fresh token on every click would invalidate any link already sent.
    const tokenToUse = club.claim_token ?? crypto.randomUUID()
    const updates: Record<string, string> = { claim_token: tokenToUse }
    if (instagram_handle) updates.instagram_handle = instagram_handle

    const { error } = await getAdminSupabase()
      .from("clubs")
      .update(updates)
      .eq("id", club_id)

    if (error) throw new Error(error.message)

    return NextResponse.json({
      ok: true,
      claim_token: tokenToUse,
      link: `${BASE_URL}/welcome?t=${tokenToUse}`,
    })
  } catch (err: any) {
    console.error("generate-ig-link error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
