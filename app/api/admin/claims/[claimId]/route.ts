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

const FROM = process.env.RESEND_FROM_EMAIL ?? "RunKlub <onboarding@resend.dev>"

function buildApprovalEmail(contactName: string, clubName: string): { html: string; text: string } {
  const safeName = contactName.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safeClub = clubName.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const signupUrl = "https://www.runklub.fit/login"

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
              <strong style="color:#ffffff;">${safeClub}</strong> has been verified and approved on RunKlub.
            </p>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              Create your free account to get your club live — post runs, connect with members, and grow your community.
            </p>
            <!-- CTA button -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background:#c5f135;">
                  <a href="${signupUrl}" target="_blank"
                    style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:900;color:#1a2110;text-decoration:none;border-radius:999px;letter-spacing:0.01em;">
                    Create your account →
                  </a>
                </td>
              </tr>
            </table>
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
                  <span style="font-size:14px;color:rgba(255,255,255,0.6);vertical-align:middle;">Create a free account at runklub.fit</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;">
                  <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:#c5f135;color:#1a2110;font-size:11px;font-weight:900;text-align:center;line-height:20px;margin-right:10px;vertical-align:middle;">2</span>
                  <span style="font-size:14px;color:rgba(255,255,255,0.6);vertical-align:middle;">We&rsquo;ll link ${safeClub} to your account</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;">
                  <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:#c5f135;color:#1a2110;font-size:11px;font-weight:900;text-align:center;line-height:20px;margin-right:10px;vertical-align:middle;">3</span>
                  <span style="font-size:14px;color:rgba(255,255,255,0.6);vertical-align:middle;">Start posting runs and growing your crew</span>
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

Create your free account to get your club live:
${signupUrl}

What happens next:
1. Create a free account at runklub.fit
2. We'll link ${clubName} to your account
3. Start posting runs and growing your crew

Questions? Just reply to this email.

— The RunKlub team`

  return { html, text }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ claimId: string }> }
) {
  try {
    // Verify caller is an admin
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

    // Fetch full claim
    const { data: claim } = await getAdminSupabase()
      .from("club_claims")
      .select("club_id, user_id, status, club_name, contact_name, contact_email")
      .eq("id", claimId)
      .single()

    if (!claim) return NextResponse.json({ error: "Claim not found" }, { status: 404 })
    if (claim.status !== "pending") return NextResponse.json({ error: "Claim already resolved" }, { status: 409 })

    if (action === "reject") {
      await getAdminSupabase().from("club_claims").update({ status: "rejected" }).eq("id", claimId)
      // Reset the club's claim token so it reappears in the Send Invites list
      if (claim.club_id) {
        await getAdminSupabase()
          .from("clubs")
          .update({ claim_token_used_at: null, claim_token: crypto.randomUUID() })
          .eq("id", claim.club_id)
      }
      return NextResponse.json({ ok: true })
    }

    // ── APPROVE ──────────────────────────────────────────────────────────────

    const isPublicClaim = !claim.user_id   // came from /claim form, no account yet
    const isInAppClaim  = !!claim.club_id && !!claim.user_id

    if (isInAppClaim) {
      // Existing club + existing user — grant access immediately
      await Promise.all([
        getAdminSupabase().from("clubs").update({ user_id: claim.user_id }).eq("id", claim.club_id),
        getAdminSupabase().from("profiles").update({ role: "manager" }).eq("id", claim.user_id),
        getAdminSupabase().from("club_claims").update({ status: "approved" }).eq("id", claimId),
      ])
    } else {
      // Public /claim form submission — just mark approved
      await getAdminSupabase().from("club_claims").update({ status: "approved" }).eq("id", claimId)
    }

    // Send approval email for public claims that have a contact email
    if (isPublicClaim && claim.contact_email) {
      const name = claim.contact_name ?? "there"
      const clubName = claim.club_name ?? "your club"
      const { html, text } = buildApprovalEmail(name, clubName)

      const { error: emailError } = await getResend().emails.send({
        from: FROM,
        to: claim.contact_email,
        subject: `✅ ${clubName} is approved on RunKlub — create your account`,
        html,
        text,
      })

      if (emailError) {
        // Log but don't fail the whole request — claim is already approved
        console.error("approval email error:", emailError)
        return NextResponse.json({ ok: true, emailError: emailError.message })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("Admin claims error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
