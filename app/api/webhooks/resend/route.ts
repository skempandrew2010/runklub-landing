import { createClient } from "@supabase/supabase-js"
import { Webhook } from "svix"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Resend webhook event types -> our email_events.event_type check constraint.
const EVENT_TYPE_MAP: Record<string, string> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })

  const payload = await req.text()
  const svixHeaders = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  }

  let event: any
  try {
    event = new Webhook(secret).verify(payload, svixHeaders)
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const eventType = EVENT_TYPE_MAP[event?.type]
  const resendId = event?.data?.email_id
  if (!eventType || !resendId) return NextResponse.json({ ok: true })

  const admin = getAdminSupabase()
  const { data: send } = await admin.from("email_sends").select("id").eq("resend_id", resendId).single()
  if (!send) return NextResponse.json({ ok: true })

  await admin.from("email_events").insert({
    email_send_id: send.id,
    event_type: eventType,
    occurred_at: event.created_at ?? new Date().toISOString(),
    raw: event,
  })

  return NextResponse.json({ ok: true })
}
