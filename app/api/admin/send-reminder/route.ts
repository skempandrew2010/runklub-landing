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
    ? `Still thinking about it? 👟`
    : `Just following up 👟`

  const body1 = isWarm
    ? `You clicked the link for <strong style="color:#ffffff;">${safeClub}</strong>${safeCity} but didn&rsquo;t quite finish. Totally fine — here&rsquo;s the link again whenever you&rsquo;re ready.`
    : `Quick follow-up from Andrew &amp; Sean — <strong style="color:#ffffff;">${safeClub}</strong>${safeCity} still has an unclaimed page on RunKlub. Runners in your city are out there looking for a group right now.`

  const body2 = isWarm
    ? `Once you&rsquo;re in you can post your runs, update your schedule, and start showing up for people in your city who are looking for exactly what your klub offers.`
    : `Claim it for free and you can post runs, keep your schedule current, and get in front of people who are already searching for a klub to join.`

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
              &mdash; Andrew &amp; Sean<br>
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
    ? `Still thinking about it?\n\nYou clicked the link for ${clubName}${city ? ` in ${city}` : ""} but didn't quite finish. Here's the link again whenever you're ready:\n\n${claimLink}\n\nOnce you're in you can post your runs, update your schedule, and start showing up for people in your city who are looking for a group.\n\n— Andrew & Sean\nRunKlub`
    : `Just following up\n\nQuick note from Andrew & Sean — ${clubName}${city ? ` in ${city}` : ""} still has an unclaimed page on RunKlub. Runners in your city are out there looking for a group right now.\n\n${claimLink}\n\nClaim it for free and you can post runs, keep your schedule current, and get in front of people who are already searching.\n\n— Andrew & Sean\nRunKlub`

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

    if (!club) return NextResponse.json({ error: "Klub not found" }, { status: 404 })
    if (!club.contact_email) return NextResponse.json({ error: "No email address on file for this klub" }, { status: 400 })
    if (club.claim_token_used_at || club.user_id) return NextResponse.json({ error: "Klub has already completed signup" }, { status: 409 })
    if (!club.invite_sent_at) return NextResponse.json({ error: "No invite has been sent to this klub yet" }, { status: 400 })
    if (!club.claim_token) return NextResponse.json({ error: "No claim token found for this klub" }, { status: 400 })

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
