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

const FROM = process.env.RESEND_FROM_EMAIL ?? "RunKlub <info@runklub.fit>"
const BASE_URL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.runklub.fit"

function buildNewsletterEmail(
  clubName: string,
  clubId: string,
  subject: string,
  body: string
): { html: string; text: string } {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const bodyHtml = esc(body).replace(/\n/g, "<br>")
  const safeClub = esc(clubName)
  const safeSubject = esc(subject)
  const clubUrl = `${BASE_URL}/clubs/${clubId}`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a2110;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding:24px 32px;border-bottom:1px solid #2e3d1a;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:20px;font-weight:900;color:#ffffff;">Run</span><span style="font-size:20px;font-weight:900;color:#c5f135;">Klub</span>
                </td>
                <td align="right">
                  <span style="font-size:12px;color:rgba(255,255,255,0.35);">${safeClub}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 12px;">
            <h1 style="margin:0 0 20px;font-size:22px;font-weight:900;color:#ffffff;line-height:1.3;">
              ${safeSubject}
            </h1>
            <div style="font-size:15px;line-height:1.8;color:rgba(255,255,255,0.75);">
              ${bodyHtml}
            </div>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:24px 32px 28px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background:#c5f135;">
                  <a href="${clubUrl}" target="_blank"
                    style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:900;color:#1a2110;text-decoration:none;border-radius:999px;">
                    View ${safeClub} &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2e3d1a;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);line-height:1.6;">
              You&rsquo;re receiving this because you follow ${safeClub} on RunKlub.<br>
              <a href="${clubUrl}" style="color:rgba(197,241,53,0.45);text-decoration:none;">Manage subscription</a>
              &nbsp;&mdash;&nbsp;
              <a href="${BASE_URL}/explore" style="color:rgba(197,241,53,0.45);text-decoration:none;">RunKlub</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `${subject}\n\n${body}\n\n---\nView ${clubName} on RunKlub: ${clubUrl}\n\nYou're receiving this because you follow ${clubName} on RunKlub.`

  return { html, text }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const adminSupabase = getAdminSupabase()
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { club_id, subject, message } = body ?? {}

    if (!club_id || !subject?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "club_id, subject, and message are required" }, { status: 400 })
    }

    // Verify the requesting user owns this club
    const { data: club } = await adminSupabase
      .from("clubs")
      .select("id, name, tier")
      .eq("id", club_id)
      .eq("user_id", user.id)
      .single()

    if (!club) return NextResponse.json({ error: "Klub not found or unauthorized" }, { status: 403 })

    if (club.tier !== "growth" && club.tier !== "enterprise") {
      return NextResponse.json(
        { error: "Newsletters are a Growth feature. Upgrade your klub to send one.", code: "growth_required" },
        { status: 403 }
      )
    }

    // Get subscriber user IDs
    const { data: subs } = await adminSupabase
      .from("subscriptions")
      .select("user_id")
      .eq("club_id", club_id)

    if (!subs || subs.length === 0) {
      return NextResponse.json({ error: "This klub has no followers yet" }, { status: 400 })
    }

    const subIds = subs.map((s: any) => s.user_id as string)

    // Fetch emails via admin auth API
    const { data: listData } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 })
    const emails = (listData?.users ?? [])
      .filter((u: any) => subIds.includes(u.id) && u.email)
      .map((u: any) => u.email as string)

    if (emails.length === 0) {
      return NextResponse.json({ error: "No subscriber emails found" }, { status: 400 })
    }

    const { html, text } = buildNewsletterEmail(club.name, club_id, subject.trim(), message.trim())
    const resend = new Resend(process.env.RESEND_API_KEY)
    const emailSubject = `${club.name}: ${subject.trim()}`

    // Send individually so each recipient's To field shows only their address
    const results = await Promise.allSettled(
      emails.map((email) =>
        resend.emails.send({
          from: FROM,
          to: email,
          subject: emailSubject,
          html,
          text,
          replyTo: user.email ?? undefined,
        })
      )
    )

    const sent = results.filter((r) => r.status === "fulfilled").length
    const failed = results.length - sent

    return NextResponse.json({ ok: true, sent, failed, total: emails.length })
  } catch (err: any) {
    console.error("send-newsletter error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
