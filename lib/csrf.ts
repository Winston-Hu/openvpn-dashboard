import { NextRequest, NextResponse } from 'next/server'

/**
 * Check CSRF for mutation endpoints.
 * Returns a 403 NextResponse if the request fails the CSRF check,
 * or null if the request is allowed to proceed.
 *
 * Allows the request if ANY of the following is true:
 *  - Custom header X-Dashboard-Request: 1 is present
 *  - Origin header matches the configured app URL (NEXT_PUBLIC_APP_URL or NEXTAUTH_URL)
 *  - No Origin header is present (e.g., same-origin curl / server-side)
 */
export function checkCsrf(req: NextRequest): NextResponse | null {
  const dashboardHeader = req.headers.get('x-dashboard-request')
  if (dashboardHeader === '1') return null

  const origin = req.headers.get('origin')
  if (!origin) return null // no origin — allow (non-browser or same-origin)

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    'http://localhost:3000'

  // Normalise: strip trailing slash
  const normalizedAppUrl = appUrl.replace(/\/$/, '')
  const normalizedOrigin = origin.replace(/\/$/, '')

  if (normalizedOrigin === normalizedAppUrl) return null

  return NextResponse.json({ error: 'Forbidden: CSRF check failed' }, { status: 403 })
}
