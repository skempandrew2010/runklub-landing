import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Intentionally unauthenticated — this is the magic-link validation step for
// someone who was invited and isn't logged into any RunKlub account. Access
// is gated by possession of the token itself, not by identity.
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token")
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 })

    const admin = getAdminSupabase()
    const { data: invite } = await admin
      .from("club_model_invites")
      .select("email, name, status")
      .eq("token", token)
      .single()

    if (!invite || invite.status !== "sent") {
      return NextResponse.json({ error: "This invite link is no longer valid" }, { status: 404 })
    }

    return NextResponse.json({ email: invite.email, name: invite.name })
  } catch (err: any) {
    console.error("invite-lookup error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
