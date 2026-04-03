import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { checkRateLimit, resetRateLimit, getClientIp } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const rateLimitKey = `login:${ip}`

  // Rate limit: max 10 attempts per IP per 15 minutes
  const rl = checkRateLimit(rateLimitKey, 10, 15 * 60 * 1000)
  if (!rl.allowed) {
    const resetInSeconds = Math.ceil((rl.resetAt - Date.now()) / 1000)
    return NextResponse.json(
      {
        error: 'Too many login attempts. Please try again later.',
        resetInSeconds,
      },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { username, password } = body as Record<string, string>

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { username: username.trim() } })

  if (!user) {
    await writeAuditLog({
      actor: username.trim(),
      action: 'LOGIN_FAILED',
      ipAddress: ip,
    })
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    await writeAuditLog({
      actor: username.trim(),
      action: 'LOGIN_FAILED',
      ipAddress: ip,
    })
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  // Successful login — clear rate limit
  resetRateLimit(rateLimitKey)

  const session = await getSession()
  session.username = user.username
  session.isLoggedIn = true
  await session.save()

  await writeAuditLog({
    actor: user.username,
    action: 'LOGIN',
    ipAddress: ip,
  })

  return NextResponse.json({ ok: true })
}
