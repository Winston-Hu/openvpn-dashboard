import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getConnectedClients } from '@/lib/openvpn'

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clients = await getConnectedClients()
  return NextResponse.json(clients)
}
