import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function getResend() { return new Resend(process.env.RESEND_API_KEY) }

const FROM = process.env.RESEND_FROM_EMAIL ?? "RunKlub <info@runklub.fit>"
const BASE_URL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.runklub.fit"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function generateMagicLink(email: string, _clubId: string): Promise<string> {
  const redirectTo = `${BASE_URL}/welcome`
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
              Your claim was approved. Click below to sign in and your klub will be linked to your account automatically.
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

Your claim was approved. Click the link below to sign in — your klub will be linked automatically.

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

  // Only record the click for real browser sessions — skip known link-preview crawlers
  // (Instagram/Facebook, Slack, Twitter, WhatsApp, Telegram all pre-fetch URLs to render
  // preview cards, which would falsely mark the link as opened before the owner clicks it)
  const ua = _req.headers.get("user-agent") ?? ""
  const isPreviewBot = /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|whatsapp|telegram|discordbot|applebot|googlebot|bingbot|yandex|instagram|preview|crawler|spider|bot\b/i.test(ua)

  // Only record a click if the invite has already been formally sent.
  // This prevents false positives from browser link-preview fetches that happen
  // during the admin's own outreach workflow (before the DM/email is actually sent).
  if (!isPreviewBot) {
    await getAdminSupabase()
      .from("clubs")
      .update({ invite_link_clicked_at: new Date().toISOString() })
      .eq("id", club.id)
      .is("invite_link_clicked_at", null)
      .not("invite_sent_at", "is", null)
  }

  return NextResponse.json({
    club: {
      id: club.id,
      name: club.name,
      city: club.city,
      instagram_handle: club.instagram_handle,
    },
  })
}

// POST — submit public claim form, creates a pending claim for admin review
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
    if (club.claim_token_used_at) return NextResponse.json({ error: "This klub has already been claimed" }, { status: 410 })

    const email = contact_email.trim().toLowerCase()

    // Prevent duplicate pending submissions for the same club
    const { data: existingPending } = await getAdminSupabase()
      .from("club_claims")
      .select("id")
      .eq("club_id", club.id)
      .eq("status", "pending")
      .is("user_id", null)
      .maybeSingle()

    if (existingPending) {
      return NextResponse.json({ error: "A claim is already pending for this klub" }, { status: 409 })
    }

    const { error: insertError } = await getAdminSupabase().from("club_claims").insert({
      club_id:       club.id,
      club_name:     club.name,
      contact_name:  contact_name.trim(),
      contact_email: email,
      message:       message?.trim() || null,
      claimed_at:    new Date().toISOString(),
      status:        "pending",
    })

    if (insertError) {
      console.error("claim insert error:", insertError)
      return NextResponse.json({ error: "Failed to submit claim" }, { status: 500 })
    }

    // Send director a pending confirmation + notify admins (non-blocking)
    sendPendingNotifications(club.name, email, contact_name.trim()).catch((err) =>
      console.error("Claim notification failed:", err)
    )

    return NextResponse.json({ ok: true, email })
  } catch (err: any) {
    console.error("claim-lookup POST error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}

async function sendPendingNotifications(clubName: string, directorEmail: string, directorName: string) {
  const safeClub = clubName.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safeName = directorName.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const reviewUrl = `${BASE_URL}/admin/claims`

  // Director confirmation
  const directorHtml = `<!DOCTYPE html>
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
          <td style="padding:32px 32px 28px;">
            <h1 style="margin:0 0 16px;font-size:24px;font-weight:900;color:#ffffff;line-height:1.3;">
              Claim received, ${safeName}! 👋
            </h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              Thanks for claiming <strong style="color:#ffffff;">${safeClub}</strong> on RunKlub.
            </p>
            <p style="margin:0;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              Your claim is <strong style="color:#c5f135;">pending review</strong>. We&rsquo;ll send you another email as soon as it&rsquo;s approved — usually within 24 hours.
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

  // Admin notification
  const adminHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a2110;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="padding:28px 32px;border-bottom:1px solid #2e3d1a;">
            <span style="font-size:22px;font-weight:900;color:#ffffff;">Run</span><span style="font-size:22px;font-weight:900;color:#c5f135;">Klub</span>
            <span style="margin-left:12px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.1em;">Admin</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 12px;">
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#ffffff;">New claim pending review</h1>
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
              <tr>
                <td style="padding:4px 0;font-size:14px;color:rgba(255,255,255,0.4);width:100px;">Klub</td>
                <td style="padding:4px 0;font-size:14px;color:#ffffff;font-weight:700;">${safeClub}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:14px;color:rgba(255,255,255,0.4);">Name</td>
                <td style="padding:4px 0;font-size:14px;color:#ffffff;">${safeName}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:14px;color:rgba(255,255,255,0.4);">Email</td>
                <td style="padding:4px 0;font-size:14px;color:#ffffff;">${directorEmail}</td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background:#c5f135;">
                  <a href="${reviewUrl}" target="_blank"
                    style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:900;color:#1a2110;text-decoration:none;border-radius:999px;">
                    Review claim →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2e3d1a;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);">RunKlub Admin — sent to all admin accounts.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const adminEmails = await getAdminEmails()

  await Promise.all([
    getResend().emails.send({
      from: FROM,
      to: directorEmail,
      subject: `Your claim for ${clubName} is pending review`,
      html: directorHtml,
      text: `Hi ${directorName},\n\nThanks for claiming ${clubName} on RunKlub. Your claim is pending review — we'll email you once it's approved, usually within 24 hours.\n\nQuestions? Reply to this email.\n— The RunKlub team`,
    }),
    adminEmails.length > 0
      ? getResend().emails.send({
          from: FROM,
          to: adminEmails,
          subject: `Klub claim pending review — ${clubName}`,
          html: adminHtml,
          text: `New klub claim pending review\n\nKlub: ${clubName}\nName: ${directorName}\nEmail: ${directorEmail}\n\nReview: ${reviewUrl}`,
        })
      : Promise.resolve(),
  ])
}

async function getAdminEmails(): Promise<string[]> {
  const { data: adminProfiles } = await getAdminSupabase()
    .from("profiles")
    .select("id")
    .eq("role", "admin")

  if (!adminProfiles?.length) return []

  const emails = await Promise.all(
    adminProfiles.map(async (p) => {
      const { data } = await getAdminSupabase().auth.admin.getUserById(p.id)
      return data.user?.email ?? null
    })
  )
  return emails.filter(Boolean) as string[]
}
