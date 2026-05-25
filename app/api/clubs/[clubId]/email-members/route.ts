import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.RESEND_FROM_EMAIL ?? "RunKlub <onboarding@resend.dev>"

const SUBJECT_MAX = 200
const MESSAGE_MAX = 5000

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function buildHtml(clubName: string, subject: string, message: string) {
  const escaped = escapeHtml(message).replace(/\n/g, "<br>")
  const safeClub = escapeHtml(clubName)
  const safeSubject = escapeHtml(subject)

  return `<!DOCTYPE html>
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
            <span style="display:block;color:#c5f135;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-top:4px;">${safeClub}</span>
          </td>
        </tr>
        <!-- Subject -->
        <tr>
          <td style="padding:28px 32px 8px;">
            <h1 style="margin:0;font-size:22px;font-weight:900;color:#ffffff;line-height:1.3;">${safeSubject}</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:12px 32px 32px;">
            <p style="margin:0;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">${escaped}</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2e3d1a;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);">
              You're receiving this because you follow <strong style="color:rgba(255,255,255,0.4);">${safeClub}</strong> on RunKlub.
              Update your preferences in the RunKlub app.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params

    // Verify auth
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Fetch club, then verify ownership
    const { data: club, error: clubError } = await supabaseAdmin
      .from("clubs")
      .select("id, name, user_id")
      .eq("id", clubId)
      .single()

    if (clubError) console.error("Club fetch error:", clubError)
    if (!club) return NextResponse.json({ error: "Club not found", detail: clubError?.message }, { status: 404 })

    // For clubs with user_id set, enforce strict ownership
    if (club.user_id !== null && club.user_id !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // For legacy clubs with null user_id, require the manager role
    if (club.user_id === null) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
      if (profile?.role !== "manager") {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }
    }

    const { subject, message } = await req.json()
    if (!subject?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "Subject and message are required" }, { status: 400 })
    }
    if (subject.trim().length > SUBJECT_MAX) {
      return NextResponse.json({ error: `Subject must be ${SUBJECT_MAX} characters or fewer` }, { status: 400 })
    }
    if (message.trim().length > MESSAGE_MAX) {
      return NextResponse.json({ error: `Message must be ${MESSAGE_MAX} characters or fewer` }, { status: 400 })
    }

    // Get subscriber user IDs
    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("club_id", clubId)

    if (!subs || subs.length === 0) {
      return NextResponse.json({ sent: 0, message: "No members to email." })
    }

    const subscriberIdSet = new Set(subs.map((s) => s.user_id))

    // Filter to members who have notifications enabled
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .in("id", Array.from(subscriberIdSet))
      .eq("notifications_enabled", true)

    const optedInIds = new Set((profiles ?? []).map((p) => p.id))

    // Get all auth users via pagination
    let allUsers: Awaited<ReturnType<typeof supabaseAdmin.auth.admin.listUsers>>["data"]["users"] = []
    let page = 1
    while (true) {
      const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
      if (listErr || !users.length) break
      allUsers = [...allUsers, ...users]
      if (users.length < 1000) break
      page++
    }

    const emails = allUsers
      .filter((u) => optedInIds.has(u.id) && u.email)
      .map((u) => u.email!)

    if (emails.length === 0) {
      return NextResponse.json({ sent: 0, message: "No members with email notifications enabled." })
    }

    const html = buildHtml(club.name, subject.trim(), message.trim())
    const text = `${club.name}\n\n${subject.trim()}\n\n${message.trim()}\n\n---\nYou're receiving this because you follow ${club.name} on RunKlub.`

    // Send in chunks of 100 (Resend batch limit)
    const chunkSize = 100
    let totalSent = 0

    for (let i = 0; i < emails.length; i += chunkSize) {
      const chunk = emails.slice(i, i + chunkSize)
      const { error: sendError } = await resend.batch.send(
        chunk.map((to) => ({
          from: FROM,
          to,
          subject: `[${club.name}] ${subject.trim()}`,
          html,
          text,
        }))
      )
      if (sendError) throw new Error(sendError.message)
      totalSent += chunk.length
    }

    return NextResponse.json({ sent: totalSent })
  } catch (err: any) {
    console.error("Email members error:", err)
    return NextResponse.json({ error: err.message ?? "Failed to send emails" }, { status: 500 })
  }
}
