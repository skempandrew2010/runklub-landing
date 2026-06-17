import { createClient } from "@supabase/supabase-js"
import nodemailer from "nodemailer"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  })
}

const FROM = `RunKlub <${process.env.GMAIL_USER ?? "runklubinfo@gmail.com"}>`
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.runklub.fit"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function generateMagicLink(email: string, clubId: string): Promise<string> {
  const redirectTo = `${BASE_URL}/welcome?club_id=${clubId}`
  const { data, error } = await getAdminSupabase().auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  })
  if (!error && data?.properties?.action_link) return data.properties.action_link

  const { data: data2, error: error2 } = await getAdminSupabase().auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  })
  if (error2 || !data2?.properties?.action_link) throw new Error("Could not generate magic link")
  return data2.properties.action_link
}

function buildSetupEmail(clubName: string, magicLinkUrl: string): { html: string; text: string } {
  const safe = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safeClub = safe(clubName)

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a2110;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="padding:28px 32px;border-bottom:1px solid #2e3d1a;">
            <span style="font-size:22px;font-weight:900;color:#ffffff;">Run</span><span style="font-size:22px;font-weight:900;color:#c5f135;">Klub</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 12px;">
            <h1 style="margin:0 0 16px;font-size:24px;font-weight:900;color:#ffffff;line-height:1.3;">
              One click to set up ${safeClub} 👟
            </h1>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              Your claim was approved. Click below to sign in and your club will be linked to your account automatically.
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background:#c5f135;">
                  <a href="${magicLinkUrl}" target="_blank"
                    style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:900;color:#1a2110;text-decoration:none;border-radius:999px;">
                    Set up ${safeClub} →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 0;font-size:12px;color:rgba(255,255,255,0.25);">
              This link expires in 24 hours and can only be used once.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2e3d1a;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);line-height:1.6;">
              Questions? Reply to this email.<br>
              RunKlub &mdash; Find people you actually want to run with.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `One click to set up ${clubName} 👟

Your claim was approved. Click the link below to sign in — your club will be linked automatically.

${magicLinkUrl}

This link expires in 24 hours and can only be used once.

Questions? Reply to this email.
— The RunKlub team`

  return { html, text }
}

// GET — look up club by token, record link click
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

  // Record first link click for funnel tracking
  await getAdminSupabase()
    .from("clubs")
    .update({ invite_link_clicked_at: new Date().toISOString() })
    .eq("id", club.id)
    .is("invite_link_clicked_at", null)

  return NextResponse.json({
    club: {
      id: club.id,
      name: club.name,
      city: club.city,
      instagram_handle: club.instagram_handle,
    },
  })
}

// POST — submit claim, auto-approve, send magic link
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

    const { data: club } = await getAdminSupabase()
      .from("clubs")
      .select("id, name, claim_token_used_at")
      .eq("claim_token", token)
      .single()

    if (!club) return NextResponse.json({ error: "Invalid link" }, { status: 404 })
    if (club.claim_token_used_at) return NextResponse.json({ error: "This club has already been claimed" }, { status: 410 })

    const email = contact_email.trim().toLowerCase()

    // Auto-approve: insert claim as approved and mark token used
    const [claimResult] = await Promise.all([
      getAdminSupabase().from("club_claims").insert({
        club_id:       club.id,
        club_name:     club.name,
        contact_name:  contact_name.trim(),
        contact_email: email,
        message:       message?.trim() || null,
        claimed_at:    new Date().toISOString(),
        status:        "approved",
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

    // Generate and send magic link
    const magicLinkUrl = await generateMagicLink(email, club.id)
    const { html, text } = buildSetupEmail(club.name, magicLinkUrl)

    await getTransporter().sendMail({
      from: FROM,
      to: email,
      subject: `Set up ${club.name} on RunKlub`,
      html,
      text,
    })

    return NextResponse.json({ ok: true, email })
  } catch (err: any) {
    console.error("claim-lookup POST error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
