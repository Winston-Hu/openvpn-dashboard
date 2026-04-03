import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { getClientIp } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn || !session.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // CSRF check
  const origin = req.headers.get('origin')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL
  const dashboardHeader = req.headers.get('x-dashboard-request')
  if (origin && appUrl && !origin.startsWith(appUrl) && dashboardHeader !== '1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { currentPassword, newPassword } = body as Record<string, string>

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'currentPassword and newPassword are required' },
      { status: 400 }
    )
  }

  if (newPassword.length < 12) {
    return NextResponse.json(
      { error: 'New password must be at least 12 characters' },
      { status: 400 }
    )
  }

  const user = await prisma.user.findUnique({ where: { username: session.username } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
  }

  const newHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({
    where: { username: session.username },
    data: { passwordHash: newHash },
  })

  const ip = getClientIp(req.headers)
  await writeAuditLog({
    actor: session.username,
    action: 'change_password',
    ipAddress: ip,
  })

  return NextResponse.json({ ok: true })
}
