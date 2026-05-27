import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, stack, type, url, context } = body

    console.error(
      JSON.stringify({
        source: "client",
        type: type ?? "error",
        message,
        stack,
        url,
        context,
        ts: new Date().toISOString(),
      })
    )
  } catch {
    // ignore malformed payloads
  }

  return NextResponse.json({ ok: true })
}
