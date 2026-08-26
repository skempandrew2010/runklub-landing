import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { Resend } from "npm:resend@6"

type Contact = {
  id: string
  club_name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  status: string
  next_followup_date: string
}

function daysOverdue(followupDate: string, today: string) {
  const a = new Date(`${followupDate}T00:00:00Z`).getTime()
  const b = new Date(`${today}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}

function buildDigestEmail(contacts: Contact[], today: string) {
  const escapeHtml = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;")

  const rows = contacts.map((c) => {
    const overdue = daysOverdue(c.next_followup_date, today)
    const overdueLabel = overdue > 0 ? `${overdue}d overdue` : "due today"
    const contactLine = [c.contact_name, c.email, c.phone].filter(Boolean).map(escapeHtml).join(" &middot; ")
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #2e3d1a;">
          <div style="font-weight:700;color:#ffffff;font-size:14px;">${escapeHtml(c.club_name)}</div>
          ${contactLine ? `<div style="color:rgba(255,255,255,0.5);font-size:12px;margin-top:2px;">${contactLine}</div>` : ""}
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #2e3d1a;text-align:right;white-space:nowrap;">
          <span style="color:#c5f135;font-size:11px;font-weight:700;text-transform:uppercase;">${escapeHtml(c.status)}</span>
          <div style="color:rgba(255,255,255,0.5);font-size:12px;margin-top:2px;">${overdueLabel}</div>
        </td>
      </tr>`
  }).join("")

  const subject = `${contacts.length} klub${contacts.length === 1 ? "" : "s"} due for follow-up`

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
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:900;color:#ffffff;line-height:1.3;">
              Outreach follow-ups due
            </h1>
            <p style="margin:0 0 20px;font-size:14px;color:rgba(255,255,255,0.5);">
              ${contacts.length} contact${contacts.length === 1 ? "" : "s"} need${contacts.length === 1 ? "s" : ""} a follow-up as of ${today}.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${rows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2e3d1a;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);line-height:1.6;">
              RunKlub Outreach CRM &mdash; /admin/crm
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `Outreach follow-ups due (${today})\n\n` +
    contacts.map((c) => {
      const overdue = daysOverdue(c.next_followup_date, today)
      const overdueLabel = overdue > 0 ? `${overdue}d overdue` : "due today"
      const contactLine = [c.contact_name, c.email, c.phone].filter(Boolean).join(" | ")
      return `- ${c.club_name} [${c.status}, ${overdueLabel}]${contactLine ? ` — ${contactLine}` : ""}`
    }).join("\n")

  return { subject, html, text }
}

Deno.serve(async (req: Request) => {
  const expected = `Bearer ${Deno.env.get("CRM_DIGEST_CRON_SECRET")}`
  if (req.headers.get("Authorization") !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const today = new Date().toISOString().slice(0, 10)

    const { data: contacts, error } = await db
      .from("contacts")
      .select("id, club_name, contact_name, email, phone, status, next_followup_date")
      .lte("next_followup_date", today)
      .not("status", "in", "(replied,closed)")
      .order("next_followup_date", { ascending: true })

    if (error) throw new Error(error.message)

    if (!contacts || contacts.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: false, count: 0 }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"))
    const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "RunKlub <info@runklub.fit>"
    const to = Deno.env.get("CRM_DIGEST_TO_EMAIL")
    if (!to) throw new Error("CRM_DIGEST_TO_EMAIL secret is not set")

    const { subject, html, text } = buildDigestEmail(contacts as Contact[], today)
    const { error: sendError } = await resend.emails.send({ from, to, subject, html, text })
    if (sendError) throw new Error(sendError.message)

    return new Response(JSON.stringify({ ok: true, sent: true, count: contacts.length }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("crm-followup-digest error:", err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
