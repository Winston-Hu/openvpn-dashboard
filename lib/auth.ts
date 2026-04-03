import { getIronSession, IronSession, SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export interface SessionData {
  username: string
  isLoggedIn: boolean
}

export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ?? 'dev-secret-change-in-production-32chars!!',
  cookieName: 'openvpn-dashboard-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies()
  return getIronSession<SessionData>(cookieStore, sessionOptions)
}

export async function requireSession(): Promise<SessionData> {
  const session = await getSession()
  if (!session.isLoggedIn || !session.username) {
    redirect('/login')
  }
  return { username: session.username, isLoggedIn: session.isLoggedIn }
}
