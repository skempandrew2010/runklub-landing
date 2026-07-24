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

function buildSignupReminderEmail(name: string, onboardingLink: string): { subject: string; html: string; text: string } {
  const safe = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safeName = safe(name)

  const subject = `Finish setting up your RunKlub account`

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
              You&rsquo;re almost in 👟
            </h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              Hey ${safeName}, you signed up for <strong style="color:#ffffff;">RunKlub</strong> but didn&rsquo;t quite finish setting up your account.
            </p>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              It only takes a minute to finish — set your location and pace and you&rsquo;ll be ready to find run klubs and runs near you.
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background:#c5f135;">
                  <a href="${onboardingLink}" target="_blank"
                    style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:900;color:#1a2110;text-decoration:none;border-radius:999px;">
                    Finish setting up →
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

  const text = `You're almost in\n\nHey ${name}, you signed up for RunKlub but didn't quite finish setting up your account.\n\nIt only takes a minute to finish — set your location and pace and you'll be ready to find run klubs and runs near you.\n\n${onboardingLink}\n\n— Andrew & Sean\nRunKlub`

  return { subject, html, text }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const admin = getAdminSupabase()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await admin
      .from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 })

    const { data: target } = await admin
      .from("profiles")
      .select("id, display_name, onboarding_complete")
      .eq("id", user_id)
      .single()

    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (target.onboarding_complete) return NextResponse.json({ error: "User has already completed signup" }, { status: 409 })

    const { data: authUser } = await admin.auth.admin.getUserById(user_id)
    const email = authUser?.user?.email
    if (!email) return NextResponse.json({ error: "No email address on file for this user" }, { status: 400 })

    const onboardingLink = `${BASE_URL}/onboarding`
    const { subject, html, text } = buildSignupReminderEmail(target.display_name ?? "there", onboardingLink)

    const { error: emailError } = await getResend().emails.send({
      from: FROM,
      to: email,
      subject,
      html,
      text,
    })
    if (emailError) throw new Error(emailError.message)

    await admin
      .from("profiles")
      .update({ signup_reminder_sent_at: new Date().toISOString() })
      .eq("id", user_id)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("send-signup-reminder error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
