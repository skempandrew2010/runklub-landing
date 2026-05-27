import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  // Reject oversized payloads (max 8 KB)
  const contentLength = req.headers.get("content-length")
  if (contentLength && parseInt(contentLength) > 8192) {
    return NextResponse.json({ ok: true }) // silently drop
  }

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
