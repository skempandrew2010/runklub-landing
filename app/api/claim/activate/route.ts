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

async function getAdminEmails(): Promise<string[]> {
  const { data: adminProfiles } = await getAdminSupabase()
    .from("profiles")
    .select("id")
    .eq("role", "admin")

  if (!adminProfiles?.length) return []

  const emails = await Promise.all(
    adminProfiles.map(async (p) => {
      const { data } = await getAdminSupabase().auth.admin.getUserById(p.id)
      return data.user?.email ?? null
    })
  )
  return emails.filter(Boolean) as string[]
}

async function sendDirectorPendingEmail(directorEmail: string, clubName: string) {
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
          <td style="padding:32px 32px 28px;">
            <h1 style="margin:0 0 16px;font-size:24px;font-weight:900;color:#ffffff;line-height:1.3;">
              Claim received 👋
            </h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              Thanks for claiming <strong style="color:#ffffff;">${safeClub}</strong> on RunKlub.
            </p>
            <p style="margin:0;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">
              Your claim is <strong style="color:#c5f135;">pending review</strong>. We&rsquo;ll send you another email as soon as it&rsquo;s approved — usually within 24 hours.
            </p>
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

  const text = `Claim received for ${clubName}\n\nThanks for claiming ${clubName} on RunKlub. Your claim is pending review — we'll email you once it's approved, usually within 24 hours.\n\nQuestions? Reply to this email.\n— The RunKlub team`

  await getResend().emails.send({
    from: FROM,
    to: directorEmail,
    subject: `Your claim for ${clubName} is pending review`,
    html,
    text,
  })
}

async function sendAdminNotification(clubName: string, directorEmail: string) {
  const adminEmails = await getAdminEmails()
  if (!adminEmails.length) return

  const safeClub = clubName.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safeEmail = directorEmail.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const reviewUrl = `${BASE_URL}/admin/claims`

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
            <span style="margin-left:12px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.1em;">Admin</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 12px;">
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#ffffff;line-height:1.3;">
              New claim pending review
            </h1>
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
              <tr>
                <td style="padding:4px 0;font-size:14px;color:rgba(255,255,255,0.4);width:100px;">Club</td>
                <td style="padding:4px 0;font-size:14px;color:#ffffff;font-weight:700;">${safeClub}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:14px;color:rgba(255,255,255,0.4);">Claimed by</td>
                <td style="padding:4px 0;font-size:14px;color:#ffffff;">${safeEmail}</td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background:#c5f135;">
                  <a href="${reviewUrl}" target="_blank"
                    style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:900;color:#1a2110;text-decoration:none;border-radius:999px;">
                    Review claim →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2e3d1a;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);line-height:1.6;">
              RunKlub Admin &mdash; this notification was sent to all admin accounts.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `New club claim pending review\n\nClub: ${clubName}\nClaimed by: ${directorEmail}\n\nReview it here: ${reviewUrl}\n\n— RunKlub Admin`

  await getResend().emails.send({
    from: FROM,
    to: adminEmails,
    subject: `Club claim pending review — ${clubName}`,
    html,
    text,
  })
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await getAdminSupabase().auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userEmail = user.email?.toLowerCase()
    if (!userEmail) return NextResponse.json({ error: "User has no email" }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const { claim_token, club_id: requestedClubId, contact_name } = body ?? {}

    if (claim_token) {
      // Primary path: director came via admin invite link
      const { data: club } = await getAdminSupabase()
        .from("clubs")
        .select("id, name, user_id, claim_token_used_at")
        .eq("claim_token", claim_token)
        .single()

      if (!club) return NextResponse.json({ error: "Invalid or expired invite link" }, { status: 404 })
      if (club.claim_token_used_at) {
        return NextResponse.json({ error: "This club has already been claimed" }, { status: 409 })
      }

      // Check if a pending claim already exists for this user + club (idempotent)
      const { data: existing } = await getAdminSupabase()
        .from("club_claims")
        .select("id, status")
        .eq("club_id", club.id)
        .eq("user_id", user.id)
        .maybeSingle()

      if (existing?.status === "approved") {
        return NextResponse.json({ ok: true, pending: false, club_id: club.id })
      }

      if (!existing) {
        const { data: existingProfile } = await getAdminSupabase()
          .from("profiles").select("role").eq("id", user.id).maybeSingle()
        const shouldSetRole = !existingProfile?.role || existingProfile.role === "user"

        await Promise.all([
          getAdminSupabase().from("club_claims").insert({
            club_id:       club.id,
            club_name:     club.name,
            user_id:       user.id,
            contact_email: userEmail,
            contact_name:  contact_name?.trim() || null,
            message:       null,
            claimed_at:    new Date().toISOString(),
            status:        "pending",
          }),
          shouldSetRole
            ? getAdminSupabase().from("profiles").upsert({ id: user.id, role: "manager" }, { onConflict: "id" })
            : Promise.resolve(),
        ])

        // Fire both emails without blocking the response
        Promise.all([
          sendDirectorPendingEmail(userEmail, club.name),
          sendAdminNotification(club.name, userEmail),
        ]).catch((err) => console.error("Claim notification email failed:", err))
      }

      return NextResponse.json({ ok: true, pending: true, club_id: club.id })
    }

    // Legacy fallback: look up via approved club_claims row by email
    const { data: claim } = requestedClubId
      ? await getAdminSupabase()
          .from("club_claims")
          .select("id, status, club_id")
          .eq("contact_email", userEmail)
          .eq("club_id", requestedClubId)
          .eq("status", "approved")
          .maybeSingle()
      : await getAdminSupabase()
          .from("club_claims")
          .select("id, status, club_id")
          .eq("contact_email", userEmail)
          .eq("status", "approved")
          .order("claimed_at", { ascending: false })
          .limit(1)
          .maybeSingle()

    if (!claim) return NextResponse.json({ error: "No approved claim found" }, { status: 403 })

    const { data: club } = await getAdminSupabase()
      .from("clubs")
      .select("id, user_id")
      .eq("id", claim.club_id)
      .single()

    if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 })
    if (club.user_id && club.user_id !== user.id) {
      return NextResponse.json({ error: "Club already has an owner" }, { status: 409 })
    }

    const { data: existingProfile } = await getAdminSupabase()
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const shouldSetRole = !existingProfile?.role || existingProfile.role === "user"

    await Promise.all([
      getAdminSupabase()
        .from("clubs")
        .update({ user_id: user.id, claim_token_used_at: new Date().toISOString() })
        .eq("id", claim.club_id),
      shouldSetRole
        ? getAdminSupabase().from("profiles").upsert({ id: user.id, role: "manager" }, { onConflict: "id" })
        : Promise.resolve(),
    ])

    return NextResponse.json({ ok: true, pending: false, club_id: claim.club_id })
  } catch (err: any) {
    console.error("claim/activate error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
