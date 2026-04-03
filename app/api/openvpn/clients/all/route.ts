import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getKnownClients, getConnectedClients, getCertExpiry } from '@/lib/openvpn'

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [knownClients, connectedClients] = await Promise.all([
    getKnownClients(),
    getConnectedClients(),
  ])

  const connectedNames = new Set(connectedClients.map((c) => c.commonName))

  const results = await Promise.all(
    knownClients.map(async (client) => {
      const certExpiry = await getCertExpiry(client.certPath)
      return {
        name: client.name,
        certPath: client.certPath,
        hasKey: client.hasKey,
        hasCcd: client.hasCcd,
        certExpiry: certExpiry ? certExpiry.toISOString() : null,
        connected: connectedNames.has(client.name),
      }
    })
  )

  return NextResponse.json(results)
}
