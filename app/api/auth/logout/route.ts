import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { headers } from 'next/headers'

export async function POST() {
  const session = await getSession()
  const username = session.username ?? 'unknown'

  const headersList = await headers()
  await writeAuditLog({
    actor: username,
    action: 'LOGOUT',
    ipAddress: headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? undefined,
  })

  session.destroy()

  return NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL ?? 'http://localhost:3000'))
}

export async function GET() {
  // Support GET redirects from server actions
  const session = await getSession()
  const username = session.username ?? 'unknown'

  const headersList = await headers()
  await writeAuditLog({
    actor: username,
    action: 'LOGOUT',
    ipAddress: headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? undefined,
  })

  session.destroy()

  return NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL ?? 'http://localhost:3000'))
}
