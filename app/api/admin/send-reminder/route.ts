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

function buildReminderEmail(
  clubName: string,
  city: string | null,
  claimLink: string,
  stage: "opened" | "invited"
): { subject: string; html: string; text: string } {
  const safe = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safeClub = safe(clubName)
  const safeCity = city ? ` in ${safe(city)}` : ""

  const isWarm = stage === "opened"

  const subject = isWarm
    ? `Still want to claim ${clubName} on RunKlub?`
    : `Reminder: ${clubName}'s RunKlub page is waiting`

  const headline = isWarm
    ? `You were so close! 👟`
    : `Don't forget about RunKlub 👟`

  const body1 = isWarm
    ? `You visited the page for <strong style="color:#ffffff;">${safeClub}</strong>${safeCity} but didn't quite finish setting it up. It only takes a minute — just click the button below to claim your club and start getting discovered by runners in your area.`
    : `Just a friendly nudge — <strong style="color:#ffffff;">${safeClub}</strong>${safeCity} still has an unclaimed page on RunKlub. Runners in your city are searching for clubs to join right now, and your page is ready and waiting for you.`

  const body2 = isWarm
    ? `Runners are already finding your page. Claiming it means you can post your schedule, update your info, and keep your community in the loop — all for free.`
    : `Claiming takes less than a minute. You&rsquo;ll be able to post your runs, keep your schedule up to date, and get discovered by people who are looking for exactly what your club offers.`

  const ctaLabel = isWarm ? `Finish setting up ${safeClub} →` : `Claim ${safeClub} →`

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
          <td style="padding:32px 32px 28px;">
            <h1 style="margin:0 0 16px;font-size:24px;font-weight:900;color:#ffffff;line-height:1.3;">
              ${headline}
            </h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              ${body1}
            </p>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              ${body2}
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background:#c5f135;">
                  <a href="${claimLink}" target="_blank"
                    style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:900;color:#1a2110;text-decoration:none;border-radius:999px;">
                    ${ctaLabel}
                  </a>
                </td>
              </tr>
            </table>
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

  const text = isWarm
    ? `You were so close!\n\nYou visited the page for ${clubName}${city ? ` in ${city}` : ""} but didn't finish setting it up. Click the link below to claim your club — it only takes a minute.\n\n${claimLink}\n\nQuestions? Reply to this email.\n— Andrew at RunKlub`
    : `Don't forget about RunKlub\n\n${clubName}${city ? ` in ${city}` : ""} still has an unclaimed page on RunKlub. Runners in your city are searching for clubs right now — claim your page for free.\n\n${claimLink}\n\nQuestions? Reply to this email.\n— Andrew at RunKlub`

  return { subject, html, text }
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

    const { club_id } = await req.json()
    if (!club_id) return NextResponse.json({ error: "club_id required" }, { status: 400 })

    const { data: club } = await getAdminSupabase()
      .from("clubs")
      .select("id, name, city, contact_email, claim_token, invite_sent_at, invite_link_clicked_at, claim_token_used_at, user_id")
      .eq("id", club_id)
      .single()

    if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 })
    if (!club.contact_email) return NextResponse.json({ error: "No email address on file for this club" }, { status: 400 })
    if (club.claim_token_used_at || club.user_id) return NextResponse.json({ error: "Club has already completed signup" }, { status: 409 })
    if (!club.invite_sent_at) return NextResponse.json({ error: "No invite has been sent to this club yet" }, { status: 400 })
    if (!club.claim_token) return NextResponse.json({ error: "No claim token found for this club" }, { status: 400 })

    const stage: "opened" | "invited" = club.invite_link_clicked_at ? "opened" : "invited"
    const claimLink = `${BASE_URL}/welcome?t=${club.claim_token}`
    const { subject, html, text } = buildReminderEmail(club.name, club.city, claimLink, stage)

    const { error: emailError } = await getResend().emails.send({
      from: FROM,
      to: club.contact_email,
      subject,
      html,
      text,
    })
    if (emailError) throw new Error(emailError.message)

    await getAdminSupabase()
      .from("clubs")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", club_id)

    return NextResponse.json({ ok: true, stage })
  } catch (err: any) {
    console.error("send-reminder error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
