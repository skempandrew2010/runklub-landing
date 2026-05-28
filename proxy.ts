import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"

// ── Only run when Upstash env vars are present ─────────────────────────────
// Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel (Storage →
// Upstash KV) or locally in .env.local.  When absent the proxy is a no-op
// so local dev is unaffected.
const UPSTASH_CONFIGURED =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN

function makeRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

// ── Rate-limit buckets (created lazily) ────────────────────────────────────
let emailRL: Ratelimit
let checkoutRL: Ratelimit
let logErrorRL: Ratelimit
let defaultRL: Ratelimit

function getRatelimiters() {
  if (!emailRL) {
    const redis = makeRedis()
    // Email blast: 3 sends / hour / IP  — anti-spam
    emailRL = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, "1 h"), prefix: "rl:email" })
    // Stripe checkout: 10 sessions / 10 min / IP
    checkoutRL = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "10 m"), prefix: "rl:checkout" })
    // Log-error beacon: 30 / min / IP  — prevent log flooding
    logErrorRL = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, "1 m"), prefix: "rl:logerror" })
    // All other API routes: 120 / min / IP
    defaultRL = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, "1 m"), prefix: "rl:api" })
  }
  return { emailRL, checkoutRL, logErrorRL, defaultRL }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  )
}

function rateLimitResponse(remaining: number, reset: number) {
  return NextResponse.json(
    { error: "Too many requests — please slow down." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
        "X-RateLimit-Remaining": String(remaining),
      },
    }
  )
}

// ── Proxy ───────────────────────────────────────────────────────────────────
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Only apply to API routes
  if (!pathname.startsWith("/api/")) return NextResponse.next()

  // Skip if Upstash is not configured (local dev without Redis)
  if (!UPSTASH_CONFIGURED) return NextResponse.next()

  const ip = getIp(req)
  const { emailRL, checkoutRL, logErrorRL, defaultRL } = getRatelimiters()

  let result

  if (pathname.startsWith("/api/clubs/") && pathname.endsWith("/email-members")) {
    result = await emailRL.limit(ip)
  } else if (pathname.startsWith("/api/stripe/checkout")) {
    result = await checkoutRL.limit(ip)
  } else if (pathname.startsWith("/api/log-error")) {
    result = await logErrorRL.limit(ip)
  } else {
    result = await defaultRL.limit(ip)
  }

  if (!result.success) {
    return rateLimitResponse(result.remaining, result.reset)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/api/:path*"],
}
