import { readFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"

// ── Load .env.local ────────────────────────────────────────────────────────────
const env = {}
try {
  readFileSync(".env.local", "utf8").split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=")
    if (key && rest.length) env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "")
  })
} catch { /* missing file — fall back to process.env */ }
const get = (k) => env[k] ?? process.env[k]

const SUPABASE_URL  = get("NEXT_PUBLIC_SUPABASE_URL")
const SERVICE_KEY   = get("SUPABASE_SERVICE_ROLE_KEY")
const RESEND_KEY    = get("RESEND_API_KEY")
const FROM          = get("RESEND_FROM_EMAIL") ?? "RunKlub <info@runklub.fit>"
const BASE_URL      = get("APP_URL") ?? get("NEXT_PUBLIC_APP_URL") ?? "https://www.runklub.fit"
const DRY_RUN       = process.argv.includes("--dry-run")

if (!SUPABASE_URL || !SERVICE_KEY || !RESEND_KEY) {
  console.error("Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY")
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const resend = new Resend(RESEND_KEY)

function buildEmail(name, clubName, trialEndsAt) {
  const expiry = new Date(trialEndsAt).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  })
  const safe = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

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
      Hey ${safe(name)},
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

async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN — no emails will be sent\n" : "🚀 Sending emails...\n")

  const { data: clubs } = await db
    .from("clubs")
    .select("id, name, user_id, trial_ends_at")
    .not("trial_ends_at", "is", null)
    .not("user_id", "is", null)

  if (!clubs?.length) { console.log("No trial clubs found."); return }

  let sent = 0, skipped = 0, errors = 0

  for (const club of clubs) {
    try {
      const { data: { user } } = await db.auth.admin.getUserById(club.user_id)
      const email = user?.email
      const name = user?.user_metadata?.display_name ?? email?.split("@")[0] ?? "there"

      if (!email) {
        console.log(`  ⚠️  SKIP  ${club.name} — no email`)
        skipped++
        continue
      }

      if (DRY_RUN) {
        console.log(`  ✓ WOULD SEND  ${club.name} → ${email}`)
        sent++
        continue
      }

      await resend.emails.send({
        from: FROM,
        to: email,
        subject: `You've got full RunKlub access — we want your feedback`,
        html: buildEmail(name, club.name, club.trial_ends_at),
        replyTo: "info@runklub.fit",
      })

      console.log(`  ✓ SENT  ${club.name} → ${email}`)
      sent++
      await new Promise((r) => setTimeout(r, 150))
    } catch (err) {
      console.error(`  ✗ ERROR  ${club.name}: ${err.message}`)
      errors++
    }
  }

  console.log(`\n${DRY_RUN ? "Preview" : "Done"}: ${sent} ${DRY_RUN ? "would send" : "sent"}, ${skipped} skipped, ${errors} errors`)
}

main().catch(console.error)
