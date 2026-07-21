import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { NextRequest, NextResponse } from "next/server"

const ADMIN_IDS = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
const FROM = process.env.RESEND_FROM_EMAIL ?? "RunKlub <info@runklub.fit>"
const BASE_URL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.runklub.fit"

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function buildTrialEmail(directorName: string, clubName: string, trialEndsAt: string): string {
  const expiry = new Date(trialEndsAt).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  })
  const safe = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1a2110;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#1a2110;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:580px;">

  <tr><td style="padding-bottom:28px;">
    <span style="font-size:22px;font-weight:900;color:#c5f135;letter-spacing:-0.5px;">RunKlub</span>
  </td></tr>

  <tr><td style="background:#1e2d12;border:1px solid #2e3d1a;border-radius:16px;padding:36px;">

    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#c5f135;text-transform:uppercase;letter-spacing:2px;">For ${safe(clubName)}</p>
    <h1 style="margin:0 0 20px;font-size:26px;font-weight:900;color:#ffffff;line-height:1.2;">
      You've got full access — we want your honest feedback.
    </h1>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
      Hey ${safe(directorName)},
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
      We've unlocked the full <strong style="color:#fff;">Enterprise plan</strong> for your club until <strong style="color:#c5f135;">${expiry}</strong>. No credit card. No strings. We just want to know what works and what doesn't before we charge anyone a dime.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#0e150a;border:1px solid #2e3d1a;border-radius:12px;padding:20px;">
      <tr><td>
        <p style="margin:0 0 12px;font-size:12px;font-weight:800;color:#c5f135;text-transform:uppercase;letter-spacing:2px;">What to try</p>
        <p style="margin:0 0 8px;font-size:14px;color:rgba(255,255,255,0.75);">📅 <strong style="color:#fff;">Schedule runs</strong> — add your weekly runs under the Runs tab</p>
        <p style="margin:0 0 8px;font-size:14px;color:rgba(255,255,255,0.75);">👥 <strong style="color:#fff;">Invite members</strong> — send personalized invites to your regulars</p>
        <p style="margin:0 0 8px;font-size:14px;color:rgba(255,255,255,0.75);">📧 <strong style="color:#fff;">Send a training schedule</strong> — email your members their week's runs automatically</p>
        <p style="margin:0 0 0;font-size:14px;color:rgba(255,255,255,0.75);">✅ <strong style="color:#fff;">Check-in on runs</strong> — members can check in on the day to build streaks and earn badges</p>
      </td></tr>
    </table>

    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
      Reply to this email with anything — bugs, confusion, missing features, things you love. We read every message and will respond personally.
    </p>

    <table cellpadding="0" cellspacing="0"><tr><td>
      <a href="${BASE_URL}/director"
        style="display:inline-block;background:#c5f135;color:#1a2110;font-size:14px;font-weight:900;text-decoration:none;padding:14px 28px;border-radius:100px;">
        Open My Dashboard →
      </a>
    </td></tr></table>

    <p style="margin:28px 0 0;font-size:13px;color:rgba(255,255,255,0.3);line-height:1.6;">
      — Andrew &amp; Sean, RunKlub<br>
      <a href="mailto:info@runklub.fit" style="color:rgba(255,255,255,0.3);">info@runklub.fit</a>
    </p>

  </td></tr>

  <tr><td style="padding-top:24px;text-align:center;">
    <p style="font-size:11px;color:rgba(255,255,255,0.2);margin:0;">
      RunKlub · <a href="${BASE_URL}" style="color:rgba(255,255,255,0.2);text-decoration:none;">runklub.fit</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const db = adminDb()
    const { data: { user }, error: authErr } = await db.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (ADMIN_IDS.length > 0 && !ADMIN_IDS.includes(user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { dry_run = false } = await req.json().catch(() => ({}))

    // Fetch all clubs with an active trial that have a real user
    const { data: trialClubs } = await db
      .from("clubs")
      .select("id, name, user_id, trial_ends_at")
      .not("trial_ends_at", "is", null)
      .not("user_id", "is", null)

    if (!trialClubs || trialClubs.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: "No trial clubs found" })
    }

    // Fetch auth emails for each director
    const resend = new Resend(process.env.RESEND_API_KEY)
    const results: { club: string; email: string; status: "sent" | "skipped" | "error"; error?: string }[] = []

    for (const club of trialClubs) {
      try {
        const { data: { user: director } } = await db.auth.admin.getUserById(club.user_id)
        const email = director?.email
        const displayName = director?.user_metadata?.display_name ?? email?.split("@")[0] ?? "there"

        if (!email) {
          results.push({ club: club.name, email: "(none)", status: "skipped" })
          continue
        }

        if (dry_run) {
          results.push({ club: club.name, email, status: "sent" })
          continue
        }

        await resend.emails.send({
          from: FROM,
          to: email,
          subject: `You've got full RunKlub access — we want your feedback`,
          html: buildTrialEmail(displayName, club.name, club.trial_ends_at),
          replyTo: "info@runklub.fit",
        })

        results.push({ club: club.name, email, status: "sent" })
        // Small delay to respect Resend rate limits
        await new Promise((r) => setTimeout(r, 120))
      } catch (err: any) {
        results.push({ club: club.name, email: "(error)", status: "error", error: err.message })
      }
    }

    const sent = results.filter((r) => r.status === "sent").length
    const errors = results.filter((r) => r.status === "error").length

    return NextResponse.json({ ok: true, sent, errors, dry_run, results })
  } catch (err: any) {
    console.error("send-trial-email error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
