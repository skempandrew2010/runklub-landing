import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Real-identity, production-facing (unlike /api/admin/club-model/*): either
// the member themselves, the club's real owner (director), or an admin can
// read/send on a given member's thread. Authorization is derived from actual
// ownership (members.user_id / clubs.user_id), not a hardcoded test account
// allowlist, so this already works correctly no matter which club a member
// or director belongs to.
async function authorizeThread(admin: ReturnType<typeof getAdminSupabase>, userId: string, memberId: string) {
  const { data: member } = await admin.from("members").select("id, club_id, user_id").eq("id", memberId).single()
  if (!member) return { ok: false as const, member: null, sender: null }

  const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).single()
  if (profile?.role === "admin") return { ok: true as const, member, sender: "director" as const }

  if (member.user_id === userId) return { ok: true as const, member, sender: "member" as const }

  const { data: club } = await admin.from("clubs").select("user_id").eq("id", member.club_id).single()
  if (club?.user_id === userId) return { ok: true as const, member, sender: "director" as const }

  return { ok: false as const, member: null, sender: null }
}

async function getCaller(req: NextRequest, admin: ReturnType<typeof getAdminSupabase>) {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return null
  const token = authHeader.replace("Bearer ", "")
  const { data: { user } } = await admin.auth.getUser(token)
  return user
}

export async function GET(req: NextRequest) {
  try {
    const admin = getAdminSupabase()
    const user = await getCaller(req, admin)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const memberId = req.nextUrl.searchParams.get("member_id")
    if (!memberId) return NextResponse.json({ error: "member_id required" }, { status: 400 })

    const { ok } = await authorizeThread(admin, user.id, memberId)
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { data: messages, error } = await admin
      .from("club_model_messages")
      .select("*")
      .eq("member_id", memberId)
      .order("created_at", { ascending: true })
    if (error) throw new Error(error.message)

    return NextResponse.json({ messages })
  } catch (err: any) {
    console.error("club-model messages GET error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = getAdminSupabase()
    const user = await getCaller(req, admin)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { member_id, body } = await req.json()
    if (!member_id || typeof body !== "string" || !body.trim()) {
      return NextResponse.json({ error: "member_id and a non-empty body are required" }, { status: 400 })
    }

    const { ok, member, sender } = await authorizeThread(admin, user.id, member_id)
    if (!ok || !member || !sender) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { data, error } = await admin
      .from("club_model_messages")
      .insert({ club_id: member.club_id, member_id: member.id, sender, body: body.trim() })
      .select()
      .single()
    if (error) throw new Error(error.message)

    return NextResponse.json({ message: data })
  } catch (err: any) {
    console.error("club-model messages POST error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
