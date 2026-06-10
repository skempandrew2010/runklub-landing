// Module-level store — persists across requests within the same serverless instance.
// Resets on cold starts, but provides effective protection against burst abuse.
const store = new Map<string, { count: number; resetAt: number }>()

/**
 * Returns true if the request is allowed, false if it should be blocked.
 * @param key    Unique key per IP + route (e.g. "claim:1.2.3.4")
 * @param max    Max requests allowed in the window
 * @param windowMs  Window duration in milliseconds
 */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= max) return false
  entry.count++
  return true
}

export function getIp(req: { headers: { get: (k: string) => string | null } }): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
}
