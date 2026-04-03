import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/openvpn'
import { writeAuditLog } from '@/lib/audit'
import { checkCsrf } from '@/lib/csrf'

const CLIENT_NAME_RE = /^[a-zA-Z0-9-]{1,32}$/

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req)
  if (csrfError) return csrfError

  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, ifconfigPush, iroute, irouteMask } = body as Record<string, string>

  if (!name || !CLIENT_NAME_RE.test(name)) {
    return NextResponse.json(
      { error: 'Invalid client name. Must be 1-32 alphanumeric characters or hyphens.' },
      { status: 400 }
    )
  }

  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    undefined

  const result = await createClient({ name, ifconfigPush, iroute, irouteMask })

  await writeAuditLog({
    actor: session.username,
    action: result.success ? 'client.create' : 'client.create.failed',
    target: name,
    detail: result.success ? 'Client created' : result.stderr,
    ipAddress,
  })

  if (!result.success) {
    return NextResponse.json(
      { error: result.stderr || 'Failed to create client', ...result },
      { status: 500 }
    )
  }

  return NextResponse.json(result)
}
