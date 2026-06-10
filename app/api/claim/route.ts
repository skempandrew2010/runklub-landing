import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    // Basic payload size guard
    const contentLength = req.headers.get("content-length")
    if (contentLength && parseInt(contentLength) > 8192) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 })
    }

    const body = await req.json()
    const { club_name, contact_name, contact_email, city, instagram, website, referral_source } = body

    // Validate required fields
    if (!club_name?.trim() || !contact_name?.trim() || !contact_email?.trim() || !city?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    if (!EMAIL_RE.test(contact_email.trim())) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
    }

    const { error } = await getAdminSupabase()
      .from("club_claims")
      .insert({
        club_name:       club_name.trim(),
        contact_name:    contact_name.trim(),
        contact_email:   contact_email.trim().toLowerCase(),
        city:            city.trim(),
        instagram:       instagram?.trim().replace(/^@/, "") || null,
        website:         website?.trim() || null,
        referral_source: referral_source?.trim() || null,
        claimed_at:      new Date().toISOString(),
        status:          "pending",
      })

    if (error) {
      console.error("claim insert error:", error)
      return NextResponse.json({ error: "Failed to submit claim" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("claim route error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
