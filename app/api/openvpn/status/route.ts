import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getServerInfo } from '@/lib/openvpn'

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const info = await getServerInfo()
  return NextResponse.json(info)
}
