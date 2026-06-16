import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET — look up club by token
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }

  const { data: club } = await getAdminSupabase()
    .from("clubs")
    .select("id, name, city, instagram_handle, claim_token_used_at")
    .eq("claim_token", token)
    .single()

  if (!club) return NextResponse.json({ error: "invalid" }, { status: 404 })
  if (club.claim_token_used_at) return NextResponse.json({ error: "used" }, { status: 410 })

  return NextResponse.json({
    club: {
      id: club.id,
      name: club.name,
      city: club.city,
      instagram_handle: club.instagram_handle,
    },
  })
}

// POST — submit the claim
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 })
  }

  try {
    const { contact_name, contact_email, message } = await req.json()

    if (!contact_name?.trim() || !contact_email?.trim()) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
    }

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!EMAIL_RE.test(contact_email.trim())) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
    }

    // Look up the club
    const { data: club } = await getAdminSupabase()
      .from("clubs")
      .select("id, name, claim_token_used_at")
      .eq("claim_token", token)
      .single()

    if (!club) return NextResponse.json({ error: "Invalid link" }, { status: 404 })
    if (club.claim_token_used_at) return NextResponse.json({ error: "This club has already been claimed" }, { status: 410 })

    // Create the claim row and mark the token as used
    const [claimResult] = await Promise.all([
      getAdminSupabase().from("club_claims").insert({
        club_id:       club.id,
        club_name:     club.name,
        contact_name:  contact_name.trim(),
        contact_email: contact_email.trim().toLowerCase(),
        message:       message?.trim() || null,
        claimed_at:    new Date().toISOString(),
        status:        "pending",
      }),
      getAdminSupabase()
        .from("clubs")
        .update({ claim_token_used_at: new Date().toISOString() })
        .eq("id", club.id),
    ])

    if (claimResult.error) {
      console.error("claim insert error:", claimResult.error)
      return NextResponse.json({ error: "Failed to submit claim" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("claim-lookup POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
