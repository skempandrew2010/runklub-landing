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

async function generateMagicLink(email: string, _clubId: string): Promise<string> {
  const redirectTo = `${BASE_URL}/welcome`
  // Try invite first (creates account if new), fall back to magic link (existing account)
  const { data, error } = await getAdminSupabase().auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  })
  if (!error && data?.properties?.action_link) return data.properties.action_link

  const { data: data2, error: error2 } = await getAdminSupabase().auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  })
  if (error2 || !data2?.properties?.action_link) throw new Error("Could not generate magic link")
  return data2.properties.action_link
}

function buildApprovalEmail(
  contactName: string,
  clubName: string,
  magicLinkUrl: string
): { html: string; text: string } {
  const safeName = contactName.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safeClub = clubName.replace(/</g, "&lt;").replace(/>/g, "&gt;")

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
              You&rsquo;re approved, ${safeName}! 🎉
            </h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              <strong style="color:#ffffff;">${safeClub}</strong> has been approved on RunKlub.
            </p>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              Click below to set up your account and get your klub live — it only takes a moment.
            </p>
            <!-- CTA -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background:#c5f135;">
                  <a href="${magicLinkUrl}" target="_blank"
                    style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:900;color:#1a2110;text-decoration:none;border-radius:999px;">
                    Set up ${safeClub} →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 0;font-size:12px;color:rgba(255,255,255,0.25);">
              This link expires in 24 hours and can only be used once.
            </p>
          </td>
        </tr>

        <!-- Steps -->
        <tr>
          <td style="padding:28px 32px;border-top:1px solid #2e3d1a;">
            <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.1em;">
              What happens next
            </p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding:6px 0;">
                  <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:#c5f135;color:#1a2110;font-size:11px;font-weight:900;text-align:center;line-height:20px;margin-right:10px;vertical-align:middle;">1</span>
                  <span style="font-size:14px;color:rgba(255,255,255,0.6);vertical-align:middle;">Click the button above to sign in</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;">
                  <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:#c5f135;color:#1a2110;font-size:11px;font-weight:900;text-align:center;line-height:20px;margin-right:10px;vertical-align:middle;">2</span>
                  <span style="font-size:14px;color:rgba(255,255,255,0.6);vertical-align:middle;">${safeClub} is automatically linked to your account</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;">
                  <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:#c5f135;color:#1a2110;font-size:11px;font-weight:900;text-align:center;line-height:20px;margin-right:10px;vertical-align:middle;">3</span>
                  <span style="font-size:14px;color:rgba(255,255,255,0.6);vertical-align:middle;">Post runs and start growing your crew</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2e3d1a;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);line-height:1.6;">
              Questions? Reply to this email and we&rsquo;ll get back to you.<br>
              RunKlub &mdash; Find people you actually want to run with.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `Hey ${contactName},

${clubName} has been approved on RunKlub! 🎉

Click the link below to sign in and get your klub live — ${clubName} will be automatically linked to your account.

${magicLinkUrl}

This link expires in 24 hours and can only be used once.

What happens next:
1. Click the link above to sign in
2. ${clubName} is automatically linked to your account
3. Post runs and start growing your crew

Questions? Just reply to this email.

— The RunKlub team`

  return { html, text }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ claimId: string }> }
) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await getAdminSupabase().auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await getAdminSupabase()
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { claimId } = await params

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(claimId)) return NextResponse.json({ error: "Invalid claim ID" }, { status: 400 })

    const body = await req.json() as { action?: string }
    const { action } = body
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const { data: claim } = await getAdminSupabase()
      .from("club_claims")
      .select("club_id, user_id, status, club_name, contact_name, contact_email")
      .eq("id", claimId)
      .single()

    if (!claim) return NextResponse.json({ error: "Claim not found" }, { status: 404 })
    if (claim.status !== "pending") return NextResponse.json({ error: "Claim already resolved" }, { status: 409 })

    if (action === "reject") {
      await getAdminSupabase().from("club_claims").update({ status: "rejected" }).eq("id", claimId)
      if (claim.club_id) {
        await getAdminSupabase()
          .from("clubs")
          .update({ claim_token_used_at: null, claim_token: crypto.randomUUID() })
          .eq("id", claim.club_id)
      }
      return NextResponse.json({ ok: true })
    }

    // ── APPROVE ──────────────────────────────────────────────────────────────

    const isInAppClaim = !!claim.club_id && !!claim.user_id

    if (isInAppClaim) {
      // Director already signed in — link the club and grant role
      const { data: existingProfile } = await getAdminSupabase()
        .from("profiles").select("role").eq("id", claim.user_id).maybeSingle()
      const shouldSetRole = existingProfile?.role !== "manager"

      await Promise.all([
        getAdminSupabase().from("clubs")
          .update({ user_id: claim.user_id, claim_token_used_at: new Date().toISOString() })
          .eq("id", claim.club_id),
        shouldSetRole
          ? getAdminSupabase().from("profiles").upsert({ id: claim.user_id, role: "manager" }, { onConflict: "id" })
          : Promise.resolve(),
        getAdminSupabase().from("club_claims").update({ status: "approved" }).eq("id", claimId),
      ])

      // Send the director a confirmation email
      if (claim.contact_email && claim.club_id) {
        const clubName = claim.club_name ?? "your klub"
        const clubUrl = `${BASE_URL}/clubs/${claim.club_id}`
        const safeName = (claim.contact_name ?? "there").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        const safeClub = clubName.replace(/</g, "&lt;").replace(/>/g, "&gt;")

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
          <td style="padding:32px 32px 12px;">
            <h1 style="margin:0 0 16px;font-size:24px;font-weight:900;color:#ffffff;line-height:1.3;">
              You&rsquo;re approved, ${safeName}! 🎉
            </h1>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              <strong style="color:#ffffff;">${safeClub}</strong> has been approved and is now live on RunKlub. Sign in to start posting runs and growing your crew.
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background:#c5f135;">
                  <a href="${clubUrl}" target="_blank"
                    style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:900;color:#1a2110;text-decoration:none;border-radius:999px;">
                    Go to ${safeClub} →
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

        const text = `Hey ${claim.contact_name ?? "there"},\n\n${clubName} has been approved on RunKlub! 🎉\n\nSign in and go to your klub: ${clubUrl}\n\nQuestions? Reply to this email.\n— The RunKlub team`

        await getResend().emails.send({
          from: FROM,
          to: claim.contact_email,
          subject: `✅ ${clubName} is approved on RunKlub!`,
          html,
          text,
        }).catch((err: any) => console.error("Approval email failed:", err))
      }

      return NextResponse.json({ ok: true })
    }

    // Public claim — generate magic link and email the director
    await getAdminSupabase().from("club_claims").update({ status: "approved" }).eq("id", claimId)

    if (claim.contact_email && claim.club_id) {
      const name = claim.contact_name ?? "there"
      const clubName = claim.club_name ?? "your klub"

      const magicLinkUrl = await generateMagicLink(claim.contact_email, claim.club_id)
      const { html, text } = buildApprovalEmail(name, clubName, magicLinkUrl)

      const { error: emailError } = await getResend().emails.send({
        from: FROM,
        to: claim.contact_email,
        subject: `✅ ${clubName} is approved — finish setting up`,
        html,
        text,
      })
      if (emailError) throw new Error(emailError.message)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("Admin claims error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
