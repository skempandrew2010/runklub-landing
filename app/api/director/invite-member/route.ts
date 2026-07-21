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

function buildInviteEmail(clubName: string, inviterName: string, inviteUrl: string, recipientName?: string): { html: string; text: string } {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safeClub = esc(clubName)
  const safeInviter = esc(inviterName)
  const safeRecipient = recipientName ? esc(recipientName) : null

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a2110;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="padding:24px 32px;border-bottom:1px solid #2e3d1a;">
            <span style="font-size:20px;font-weight:900;color:#ffffff;">Run</span><span style="font-size:20px;font-weight:900;color:#c5f135;">Klub</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 12px;">
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#ffffff;line-height:1.3;">
              You've been invited to join ${safeClub}
            </h1>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:rgba(255,255,255,0.75);">
              ${safeInviter} has invited ${safeRecipient ? safeRecipient : "you"} to join <strong style="color:#ffffff;">${safeClub}</strong> on RunKlub — a running community app to connect with local run clubs and discover group runs near you.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 32px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background:#c5f135;">
                  <a href="${inviteUrl}" target="_blank"
                    style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:900;color:#1a2110;text-decoration:none;border-radius:999px;">
                    Accept Invite &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2e3d1a;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);line-height:1.6;">
              If you didn't expect this invite, you can safely ignore this email.<br>
              <a href="${BASE_URL}/explore" style="color:rgba(197,241,53,0.45);text-decoration:none;">RunKlub</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `You've been invited to join ${clubName}\n\n${inviterName} has invited you to join ${clubName} on RunKlub.\n\nAccept your invite: ${inviteUrl}\n\n---\nIf you didn't expect this invite, you can safely ignore this email.`

  return { html, text }
}

// POST /api/director/invite-member — send invite
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const adminSupabase = getAdminSupabase()
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { club_id, email, name, region_id } = body ?? {}

    if (!club_id || !email?.trim()) {
      return NextResponse.json({ error: "club_id and email are required" }, { status: 400 })
    }

    const emailNorm = email.trim().toLowerCase()

    // Verify director owns this club
    const { data: club } = await adminSupabase
      .from("clubs")
      .select("id, name")
      .eq("id", club_id)
      .eq("user_id", user.id)
      .single()

    if (!club) return NextResponse.json({ error: "Club not found or unauthorized" }, { status: 403 })

    // Check if already a member
    const { data: existingMember } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 })
    const existingUser = existingMember?.users?.find((u: any) => u.email?.toLowerCase() === emailNorm)
    if (existingUser) {
      const { data: sub } = await adminSupabase
        .from("subscriptions")
        .select("id")
        .eq("club_id", club_id)
        .eq("user_id", existingUser.id)
        .maybeSingle()
      if (sub) return NextResponse.json({ error: "This person is already a member" }, { status: 400 })
    }

    // Check for existing pending invite
    const { data: existingInvite } = await adminSupabase
      .from("member_invites")
      .select("id, status")
      .eq("club_id", club_id)
      .eq("email", emailNorm)
      .eq("status", "pending")
      .maybeSingle()

    if (existingInvite) return NextResponse.json({ error: "An invite is already pending for this email" }, { status: 400 })

    // Create invite record
    const { data: invite, error: insertError } = await adminSupabase
      .from("member_invites")
      .insert({ club_id, invited_by: user.id, email: emailNorm, name: name?.trim() || null, preferred_region_id: region_id || null })
      .select("token")
      .single()

    if (insertError || !invite) return NextResponse.json({ error: "Failed to create invite" }, { status: 500 })

    // Get director's display name for the email
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single()

    const inviterName = profile?.display_name || "A club director"
    const inviteUrl = `${BASE_URL}/invite/${invite.token}`
    const { html, text } = buildInviteEmail(club.name, inviterName, inviteUrl, name?.trim() || undefined)

    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error: emailError } = await resend.emails.send({
      from: FROM,
      to: emailNorm,
      subject: `You're invited to join ${club.name} on RunKlub`,
      html,
      text,
    })

    if (emailError) {
      // Still return the invite even if email fails
      console.error("invite email error:", emailError)
      return NextResponse.json({ ok: true, warning: "Invite created but email delivery failed" })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("invite-member error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/director/invite-member — revoke invite
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const adminSupabase = getAdminSupabase()
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { invite_id } = await req.json()
    if (!invite_id) return NextResponse.json({ error: "invite_id required" }, { status: 400 })

    // Verify director owns the club this invite belongs to
    const { error } = await adminSupabase
      .from("member_invites")
      .update({ status: "revoked" })
      .eq("id", invite_id)
      .eq("status", "pending")
      .in(
        "club_id",
        adminSupabase.from("clubs").select("id").eq("user_id", user.id) as any
      )

    if (error) return NextResponse.json({ error: "Failed to revoke invite" }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
