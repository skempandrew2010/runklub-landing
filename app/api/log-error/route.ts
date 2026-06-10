import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, getIp } from "@/lib/rateLimit"

export async function POST(req: NextRequest) {
  // 30 log events per IP per 5 minutes
  if (!checkRateLimit(`log-error:${getIp(req)}`, 30, 5 * 60 * 1000)) {
    return NextResponse.json({ ok: true }) // silently drop excess
  }

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
