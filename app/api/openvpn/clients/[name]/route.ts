import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getClientDetail } from '@/lib/openvpn'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name } = await params
  const detail = await getClientDetail(name)

  if (!detail) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  // Serialize Date to ISO string
  return NextResponse.json({
    ...detail,
    certExpiry: detail.certExpiry ? detail.certExpiry.toISOString() : null,
  })
}
