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

function buildInviteEmail(clubName: string, city: string | null, claimLink: string): { html: string; text: string } {
  const safe = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safeClub = safe(clubName)
  const safeCity = city ? ` in ${safe(city)}` : ""

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a2110;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding:28px 32px;border-bottom:1px solid #2e3d1a;">
            <span style="font-size:22px;font-weight:900;color:#ffffff;">Run</span><span style="font-size:22px;font-weight:900;color:#c5f135;">Klub</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 12px;">
            <h1 style="margin:0 0 16px;font-size:24px;font-weight:900;color:#ffffff;line-height:1.3;">
              ${safeClub} is on RunKlub 👟
            </h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              We&rsquo;ve added <strong style="color:#ffffff;">${safeClub}</strong>${safeCity} to RunKlub — a free platform that puts everything runners need to find your club in one place. Your schedule, location, and club info are all there so that when someone in your city is looking for a group to run with, they can find you instantly.
            </p>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              No more runners missing out because they didn&rsquo;t know you existed. Claim your page, post your runs and events, and keep your whole community in the loop — all in one place. Let RunKlub do the work of getting you discovered.
            </p>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              Click below to claim your club and start posting runs right away — or just reply to this email and we can set up a quick call. I&rsquo;d love to hear about your club and help you get more people through the door.
            </p>
            <!-- CTA -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background:#c5f135;">
                  <a href="${claimLink}" target="_blank"
                    style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:900;color:#1a2110;text-decoration:none;border-radius:999px;">
                    Claim ${safeClub} →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- What you get -->
        <tr>
          <td style="padding:28px 32px;border-top:1px solid #2e3d1a;">
            <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.1em;">
              What you get
            </p>
            <table cellpadding="0" cellspacing="0" width="100%">
              ${[
                ["📍", "One place for your club info — schedule, location, and details all in one spot"],
                ["👟", "Get discovered — runners in your city searching for a club will find you"],
                ["📲", "Keep your community up to date — members get notified every time you post a run or event"],
              ].map(([icon, text]) => `
              <tr>
                <td style="padding:5px 0;font-size:14px;color:rgba(255,255,255,0.6);">
                  <span style="margin-right:8px;">${icon}</span>${text}
                </td>
              </tr>`).join("")}
            </table>
          </td>
        </tr>

        <!-- Footer -->
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

  const text = `${clubName} is on RunKlub 👟

We've added ${clubName}${safeCity} to RunKlub — a free platform that puts everything runners need to find your club in one place. Your schedule, location, and club info are all there so that when someone in your city is looking for a group to run with, they can find you instantly.

No more runners missing out because they didn't know you existed. Claim your page, post your runs and events, and keep your whole community in the loop — all in one place. Let RunKlub do the work of getting you discovered.

Claim your club here:

${claimLink}

Or just reply to this email and we can set up a quick call — I'd love to hear about your club and help you get more people through the door.

— Andrew at RunKlub`

  return { html, text }
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

    const body = await req.json()
    const { club_id, email: overrideEmail, resend } = body

    if (!club_id) return NextResponse.json({ error: "club_id required" }, { status: 400 })

    const { data: club } = await getAdminSupabase()
      .from("clubs")
      .select("id, name, city, claim_token, claim_token_used_at, contact_email, invite_sent_at")
      .eq("id", club_id)
      .single()

    if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 })
    if (club.claim_token_used_at) return NextResponse.json({ error: "Club already claimed" }, { status: 409 })

    // Parse and validate emails (supports comma-separated)
    const rawEmails = overrideEmail?.trim() || club.contact_email?.trim()
    if (!rawEmails) return NextResponse.json({ error: "No email address provided" }, { status: 400 })
    const emails = rawEmails.split(",").map((e: string) => e.trim()).filter(Boolean)
    if (emails.length === 0) return NextResponse.json({ error: "No valid email address provided" }, { status: 400 })

    // Generate a new token if one doesn't exist, on resend, or if already invited before
    let currentClaimToken = club.claim_token
    if (!currentClaimToken || resend || club.invite_sent_at) {
      currentClaimToken = crypto.randomUUID()
      await getAdminSupabase()
        .from("clubs")
        .update({ claim_token: currentClaimToken })
        .eq("id", club_id)
    }

    // Save contact_email and invite_sent_at
    const updates: Record<string, unknown> = { invite_sent_at: new Date().toISOString() }
    if (overrideEmail?.trim() && overrideEmail.trim() !== club.contact_email) {
      updates.contact_email = overrideEmail.trim()
    }
    await getAdminSupabase().from("clubs").update(updates).eq("id", club_id)

    // The email link points to OUR page, not directly to Supabase.
    // This prevents email scanners from consuming the one-time Supabase OTP
    // before the director gets a chance to click it.
    const claimLink = `${BASE_URL}/welcome?t=${currentClaimToken}`
    const { html, text } = buildInviteEmail(club.name, club.city, claimLink)

    const { error: emailError } = await getResend().emails.send({
      from: FROM,
      to: emails,
      subject: `Claim ${club.name} on RunKlub`,
      html,
      text,
    })
    if (emailError) throw new Error(emailError.message)

    return NextResponse.json({ ok: true, emails })
  } catch (err: any) {
    console.error("send-claim-invite error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
