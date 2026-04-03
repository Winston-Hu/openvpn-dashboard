import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { buildOvpnConfig } from '@/lib/openvpn'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name } = await params
  const config = await buildOvpnConfig(name)

  if (!config) {
    return NextResponse.json(
      { error: 'Could not build .ovpn config. Required files may be missing.' },
      { status: 404 }
    )
  }

  // ?view=true → inline text, no download prompt
  const viewMode = req.nextUrl.searchParams.get('view') === 'true'

  if (viewMode) {
    return new NextResponse(config, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  }

  return new NextResponse(config, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-openvpn-profile',
      'Content-Disposition': `attachment; filename="${name}.ovpn"`,
    },
  })
}
