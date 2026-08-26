import { createClient } from "@supabase/supabase-js"
import { ImapFlow } from "imapflow"
import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Per-mailbox cap so a large backfill (?days=90) can't run past the function's time limit.
const MAX_MESSAGES_PER_MAILBOX = 300

async function findMailbox(client: ImapFlow, specialUse: string, fallbackName: string) {
  const list = await client.list()
  const match = list.find((box) => box.specialUse === specialUse)
  return match?.path ?? fallbackName
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const days = Math.min(Number(req.nextUrl.searchParams.get("days")) || 4, 90)
  const since = new Date()
  since.setDate(since.getDate() - days)

  const db = getAdminSupabase()

  const { data: contacts, error: contactsError } = await db
    .from("contacts")
    .select("id, email")
    .not("email", "is", null)
  if (contactsError) {
    return NextResponse.json({ error: contactsError.message }, { status: 500 })
  }

  const emailToContactId = new Map<string, string>()
  for (const c of contacts ?? []) {
    if (c.email) emailToContactId.set(c.email.toLowerCase().trim(), c.id)
  }
  if (emailToContactId.size === 0) {
    return NextResponse.json({ ok: true, scanned: 0, matched: 0, inserted: 0 })
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_IMAP_USER!,
      pass: process.env.GMAIL_IMAP_APP_PASSWORD!,
    },
    logger: false,
  })

  type TouchRow = {
    contact_id: string
    type: "email"
    summary: string
    occurred_at: string
    gmail_message_id: string
  }
  const touches: TouchRow[] = []
  let scanned = 0

  try {
    await client.connect()

    const inboxPath = await findMailbox(client, "\\Inbox", "INBOX")
    const sentPath = await findMailbox(client, "\\Sent", "[Gmail]/Sent Mail")

    for (const mailboxPath of [inboxPath, sentPath]) {
      const lock = await client.getMailboxLock(mailboxPath)
      try {
        const uids = await client.search({ since }, { uid: true })
        if (!uids) continue
        const limited = uids.slice(-MAX_MESSAGES_PER_MAILBOX)

        for await (const msg of client.fetch(limited, { envelope: true, uid: true })) {
          scanned++
          if (!msg.envelope) continue
          const addresses = [
            ...(msg.envelope.from ?? []),
            ...(msg.envelope.to ?? []),
            ...(msg.envelope.cc ?? []),
          ]

          let matchedContactId: string | null = null
          for (const addr of addresses) {
            const email = addr.address?.toLowerCase().trim()
            if (email && emailToContactId.has(email)) {
              matchedContactId = emailToContactId.get(email)!
              break
            }
          }
          if (!matchedContactId || !msg.envelope.messageId) continue

          touches.push({
            contact_id: matchedContactId,
            type: "email",
            summary: (msg.envelope.subject ?? "(no subject)").slice(0, 200),
            occurred_at: (msg.envelope.date ?? new Date()).toISOString(),
            gmail_message_id: msg.envelope.messageId,
          })
        }
      } finally {
        lock.release()
      }
    }
  } finally {
    await client.logout().catch(() => {})
  }

  let inserted = 0
  if (touches.length > 0) {
    const { data, error } = await db
      .from("touches")
      .upsert(touches, { onConflict: "gmail_message_id", ignoreDuplicates: true })
      .select("id")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    inserted = data?.length ?? 0
  }

  return NextResponse.json({ ok: true, scanned, matched: touches.length, inserted })
}
