import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { revokeClient } from '@/lib/openvpn'
import { writeAuditLog } from '@/lib/audit'
import { checkCsrf } from '@/lib/csrf'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const csrfError = checkCsrf(req)
  if (csrfError) return csrfError

  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name } = await params
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    undefined

  const result = await revokeClient(name)

  await writeAuditLog({
    actor: session.username,
    action: result.success ? 'client.revoke' : 'client.revoke.failed',
    target: name,
    detail: result.success ? 'Client revoked' : result.stderr,
    ipAddress,
  })

  if (!result.success) {
    return NextResponse.json(
      { error: result.stderr || 'Failed to revoke client', ...result },
      { status: 500 }
    )
  }

  return NextResponse.json(result)
}
