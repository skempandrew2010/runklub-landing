import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ claimId: string }> }
) {
  // Verify caller is an admin
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const token = authHeader.replace("Bearer ", "")
  const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { claimId } = await params

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(claimId)) return NextResponse.json({ error: "Invalid claim ID" }, { status: 400 })

  const body = await req.json() as { action?: string }
  const { action } = body
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }

  // Fetch claim and verify it is still pending
  const { data: claim } = await adminSupabase
    .from("club_claims")
    .select("club_id, user_id, status")
    .eq("id", claimId)
    .single()

  if (!claim) return NextResponse.json({ error: "Claim not found" }, { status: 404 })
  if (claim.status !== "pending") return NextResponse.json({ error: "Claim already resolved" }, { status: 409 })

  if (action === "reject") {
    await adminSupabase.from("club_claims").update({ status: "rejected" }).eq("id", claimId)
    return NextResponse.json({ ok: true })
  }

  // approve — assign club ownership, upgrade role, mark claim approved
  await Promise.all([
    adminSupabase.from("clubs").update({ user_id: claim.user_id }).eq("id", claim.club_id),
    adminSupabase.from("profiles").update({ role: "manager" }).eq("id", claim.user_id),
    adminSupabase.from("club_claims").update({ status: "approved" }).eq("id", claimId),
  ])

  return NextResponse.json({ ok: true })
}
