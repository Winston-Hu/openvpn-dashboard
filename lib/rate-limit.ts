/**
 * Simple in-memory rate limiter.
 * Suitable for single-process deployments.
 * Max N attempts per IP per window (ms).
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export function checkRateLimit(
  key: string,
  maxAttempts = 10,
  windowMs = 15 * 60 * 1000
): RateLimitResult {
  const now = Date.now()
  let entry = store.get(key)

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs }
    store.set(key, entry)
  }

  entry.count += 1

  const allowed = entry.count <= maxAttempts
  const remaining = Math.max(0, maxAttempts - entry.count)

  return { allowed, remaining, resetAt: entry.resetAt }
}

export function resetRateLimit(key: string): void {
  store.delete(key)
}

/** Extract IP from request headers for rate limiting */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return headers.get('x-real-ip') ?? 'unknown'
}
