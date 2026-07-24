import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { NextRequest, NextResponse } from "next/server"
import { TEST_MANAGER_USER_ID } from "@/lib/clubModel/testAccounts"
import { CLUB_ID } from "@/lib/clubModel/constants"
import { getClubModelTier } from "@/lib/clubModel/tierGate"

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

function buildInviteEmail(name: string | null, joinLink: string): { subject: string; html: string; text: string } {
  const safe = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const greeting = name ? `Hey ${safe(name)},` : "Hey,"

  const subject = "You're invited to join the klub on RunKlub"

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0EDE8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0EDE8;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#F0EDE8;border-radius:16px;overflow:hidden;max-width:560px;width:100%;">
        <tr>
          <td style="background:#0D0D0D;padding:28px 32px;">
            <span style="font-size:22px;font-weight:900;font-family:'Arial Black',Arial,sans-serif;color:#ffffff;">Run<span style="color:#C8F23C;">Klub</span></span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 16px;font-size:24px;font-weight:900;font-family:'Arial Black',Arial,sans-serif;color:#0D0D0D;line-height:1.3;">
              You&rsquo;re invited 👟
            </h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:rgba(13,13,13,0.7);">
              ${greeting} your klub manager invited you to join the klub on RunKlub. Pick your pace, your
              region, and you&rsquo;ll be matched with the right group and coach.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin-top:16px;">
              <tr>
                <td style="border-radius:999px;background:#C8F23C;">
                  <a href="${joinLink}" target="_blank"
                    style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:900;font-family:'Arial Black',Arial,sans-serif;color:#0D0D0D;text-decoration:none;border-radius:999px;">
                    Join the klub →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#0D0D0D;padding:20px 32px;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3);line-height:1.6;">
              RunKlub &mdash; Find people you actually want to run with.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `You're invited\n\n${greeting} your klub manager invited you to join the klub on RunKlub. Pick your pace, your region, and you'll be matched with the right group and coach.\n\n${joinLink}\n\nRunKlub — Find people you actually want to run with.`

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
    const isAdmin = profile?.role === "admin"
    const isManagerTester = user.id === TEST_MANAGER_USER_ID
    if (!isAdmin && !isManagerTester) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (!isAdmin && !(await getClubModelTier(admin))) {
      return NextResponse.json({ error: "This klub needs a Starter, Pro, or Premium plan" }, { status: 403 })
    }

    const { email, name } = await req.json()
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 })
    }

    const { data: invite, error: insertError } = await admin
      .from("club_model_invites")
      .insert({ club_id: CLUB_ID, email: email.trim(), name: name?.trim() || null })
      .select()
      .single()
    if (insertError) throw new Error(insertError.message)

    const joinLink = `${BASE_URL}/admin/club-model/join?invite=${invite.token}`
    const { subject, html, text } = buildInviteEmail(invite.name, joinLink)

    const { error: emailError } = await getResend().emails.send({
      from: FROM,
      to: invite.email,
      subject,
      html,
      text,
    })
    if (emailError) throw new Error(emailError.message)

    return NextResponse.json({ ok: true, invite })
  } catch (err: any) {
    console.error("send-invite error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
