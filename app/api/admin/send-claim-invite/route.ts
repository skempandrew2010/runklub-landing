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

function buildInviteEmail(clubName: string, city: string | null, claimUrl: string): { html: string; text: string } {
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
              We&rsquo;ve added <strong style="color:#ffffff;">${safeClub}</strong>${safeCity} to RunKlub — a platform where runners discover clubs, find group runs, and connect with their local running community.
            </p>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              Claim your club to take ownership: post upcoming runs, manage your profile, and grow your crew.
            </p>
            <!-- CTA -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background:#c5f135;">
                  <a href="${claimUrl}" target="_blank"
                    style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:900;color:#1a2110;text-decoration:none;border-radius:999px;">
                    Claim ${safeClub} →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 0;font-size:12px;color:rgba(255,255,255,0.25);">
              Or copy this link: <a href="${claimUrl}" style="color:rgba(197,241,53,0.6);">${claimUrl}</a>
            </p>
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
                ["📅", "Post upcoming runs so members always know when you&rsquo;re going out"],
                ["👟", "Grow your crew — runners in your city are already looking for clubs like yours"],
                ["📲", "Members follow your club and get notified about new runs"],
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
              This link is unique to ${safeClub} and expires once used. Questions? Reply to this email.<br>
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

We've added ${clubName}${safeCity} to RunKlub — a platform where runners discover clubs, find group runs, and connect with their local running community.

Claim your club to take ownership: post upcoming runs, manage your profile, and grow your crew.

Claim your club here:
${claimUrl}

What you get:
• Post upcoming runs so members always know when you're going out
• Grow your crew — runners in your city are already looking for clubs like yours
• Members follow your club and get notified about new runs

Questions? Just reply to this email.
— The RunKlub team`

  return { html, text }
}

export async function POST(req: NextRequest) {
  try {
    // Verify caller is an admin
    const authHeader = req.headers.get("Authorization")
    console.log("send-claim-invite: authHeader present:", !!authHeader, "value:", authHeader?.slice(0, 20))
    if (!authHeader) return NextResponse.json({ error: "Unauthorized: no header" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    console.log("send-claim-invite: token:", token.slice(0, 20))
    const { data: { user }, error: authError } = await getAdminSupabase().auth.getUser(token)
    console.log("send-claim-invite: user:", user?.id, "authError:", authError?.message)
    if (authError || !user) return NextResponse.json({ error: `Unauthorized: ${authError?.message ?? "no user"}` }, { status: 401 })

    const { data: profile } = await getAdminSupabase()
      .from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    const { club_id, email: overrideEmail } = body

    if (!club_id) return NextResponse.json({ error: "club_id required" }, { status: 400 })

    // Fetch club
    const { data: club } = await getAdminSupabase()
      .from("clubs")
      .select("id, name, city, claim_token, claim_token_used_at, contact_email")
      .eq("id", club_id)
      .single()

    if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 })
    if (club.claim_token_used_at) return NextResponse.json({ error: "Club already claimed" }, { status: 409 })

    const sendTo = overrideEmail?.trim() || club.contact_email?.trim()
    if (!sendTo) return NextResponse.json({ error: "No email address provided" }, { status: 400 })

    // Save contact_email if we got one via override and it wasn't stored yet
    if (overrideEmail?.trim() && overrideEmail.trim() !== club.contact_email) {
      await getAdminSupabase()
        .from("clubs")
        .update({ contact_email: overrideEmail.trim() })
        .eq("id", club_id)
    }

    const claimUrl = `${BASE_URL}/claim/${club.claim_token}`
    const { html, text } = buildInviteEmail(club.name, club.city, claimUrl)

    await getTransporter().sendMail({
      from: FROM,
      to: sendTo,
      subject: `Claim ${club.name} on RunKlub`,
      html,
      text,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("send-claim-invite error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
