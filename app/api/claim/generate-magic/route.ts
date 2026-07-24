import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const BASE_URL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.runklub.fit"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Called when the director clicks "Sign in" on the /welcome?t=<token> page.
// Generating the magic link here (not at email send time) means email scanners
// can't burn the one-time Supabase OTP before the real user clicks.
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json()

    if (!token || !UUID_RE.test(token)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 })
    }

    const { data: club } = await getAdminSupabase()
      .from("clubs")
      .select("id, name, contact_email, claim_token_used_at")
      .eq("claim_token", token)
      .single()

    if (!club) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 })
    if (club.claim_token_used_at) return NextResponse.json({ error: "Klub already claimed" }, { status: 410 })

    // Find the approved claim to get the email to sign in as
    const { data: claim } = await getAdminSupabase()
      .from("club_claims")
      .select("contact_email")
      .eq("club_id", club.id)
      .eq("status", "approved")
      .order("claimed_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const email = claim?.contact_email ?? club.contact_email
    if (!email) return NextResponse.json({ error: "No email on file for this klub" }, { status: 400 })

    const redirectTo = `${BASE_URL}/welcome`

    // Try invite (new users), fall back to magic link (existing users)
    const { data, error } = await getAdminSupabase().auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    })

    let url = data?.properties?.action_link

    if (error || !url) {
      const { data: data2, error: error2 } = await getAdminSupabase().auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      })
      if (error2 || !data2?.properties?.action_link) {
        throw new Error("Could not generate sign-in link")
      }
      url = data2.properties.action_link
    }

    return NextResponse.json({ url })
  } catch (err: any) {
    console.error("generate-magic error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
