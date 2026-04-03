import { requireSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { LogOut, Shield } from 'lucide-react'
import SidebarNav from '@/components/SidebarNav'

async function logoutAction() {
  'use server'
  redirect('/api/auth/logout')
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let session
  try {
    session = await requireSession()
  } catch {
    redirect('/login')
  }

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-sm">OpenVPN Dashboard</span>
          </div>
        </div>

        {/* Nav — Client Component for active link highlighting */}
        <SidebarNav />

        {/* User section */}
        <div className="px-3 py-4 border-t border-slate-700">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold uppercase">
                {session.username[0]}
              </span>
            </div>
            <span className="text-slate-300 text-sm truncate">{session.username}</span>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div />
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Signed in as</span>
            <span className="font-medium text-slate-900">{session.username}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-slate-50 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
