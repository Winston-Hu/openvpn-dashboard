import { requireSession } from '@/lib/auth'
import fs from 'fs/promises'
import { Settings, Server, User, Key, CheckCircle, XCircle } from 'lucide-react'
import ChangePasswordForm from './ChangePasswordForm'

// Env vars the app reads, with descriptions and whether to mask the value
const ENV_VARS: Array<{
  key: string
  description: string
  sensitive?: boolean
  defaultValue?: string
}> = [
  { key: 'DATABASE_URL', description: 'SQLite database path', defaultValue: 'file:./prisma/dev.db' },
  { key: 'SESSION_SECRET', description: 'Cookie encryption secret', sensitive: true },
  { key: 'BOOTSTRAP_ADMIN_USERNAME', description: 'Initial admin username', defaultValue: 'admin' },
  { key: 'BOOTSTRAP_ADMIN_PASSWORD', description: 'Initial admin password (seed only)', sensitive: true },
  { key: 'OPENVPN_STATUS_LOG', description: 'OpenVPN status.log path', defaultValue: '/var/log/openvpn/status.log' },
  { key: 'OPENVPN_PKI_ISSUED_DIR', description: 'PKI issued certs directory', defaultValue: '/etc/openvpn/server/easy-rsa/pki/issued' },
  { key: 'OPENVPN_PKI_PRIVATE_DIR', description: 'PKI private keys directory', defaultValue: '/etc/openvpn/server/easy-rsa/pki/private' },
  { key: 'OPENVPN_CCD_DIR', description: 'Client config directory (CCD)', defaultValue: '/etc/openvpn/server/ccd' },
  { key: 'OPENVPN_SERVER_CONF', description: 'server.conf path', defaultValue: '/etc/openvpn/server/server.conf' },
  { key: 'OPENVPN_INSTALL_SCRIPT', description: 'openvpn-install.sh path', defaultValue: '/opt/openvpn-install/openvpn-install.sh' },
  { key: 'MANUAL_CLIENT_OVPN_SCRIPT', description: 'manual-client-ovpn.sh path', defaultValue: '/opt/openvpn-install/manual-client-ovpn.sh' },
  { key: 'OPENVPN_OVPN_OUTPUT_DIR', description: '.ovpn output directory', defaultValue: '/etc/openvpn/server/easy-rsa/pki' },
  { key: 'OPENVPN_CA_CERT', description: 'CA certificate path', defaultValue: '/etc/openvpn/server/easy-rsa/pki/ca.crt' },
  { key: 'OPENVPN_MGMT_SOCK', description: 'Management socket path', defaultValue: '/var/run/openvpn-server/server.sock' },
  { key: 'OPENVPN_SERVER_HOST', description: 'Public VPN server hostname/IP', defaultValue: 'YOUR_SERVER_IP' },
  { key: 'NEXT_PUBLIC_APP_URL', description: 'Dashboard public URL', defaultValue: 'http://localhost:3000' },
  { key: 'PORT', description: 'Node.js server port', defaultValue: '3000' },
]

async function checkExecutable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function StatusIcon({ ok }: { ok: boolean }) {
  if (ok) return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
  return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
}

export default async function SettingsPage() {
  const session = await requireSession()

  const configPath = process.env.OPENVPN_SERVER_CONF ?? '/etc/openvpn/server/server.conf'
  const statusLogPath = process.env.OPENVPN_STATUS_LOG ?? '/var/log/openvpn/status.log'
  const mgmtSock = process.env.OPENVPN_MGMT_SOCK ?? '/var/run/openvpn-server/server.sock'
  const installScript = process.env.OPENVPN_INSTALL_SCRIPT ?? '/opt/openvpn-install/openvpn-install.sh'
  const manualScript = process.env.MANUAL_CLIENT_OVPN_SCRIPT ?? '/opt/openvpn-install/manual-client-ovpn.sh'

  // Parse server.conf for port/proto/dev
  let port = '1194'
  let proto = 'udp'
  let dev = 'tun'
  try {
    const confContent = await fs.readFile(configPath, 'utf-8')
    for (const line of confContent.split('\n')) {
      const t = line.trim()
      if (t.startsWith('#') || t.startsWith(';')) continue
      const parts = t.split(/\s+/)
      switch (parts[0]) {
        case 'port': port = parts[1] ?? port; break
        case 'proto': proto = parts[1] ?? proto; break
        case 'dev': dev = parts[1] ?? dev; break
      }
    }
  } catch { /* server.conf not readable */ }

  const [installOk, manualOk] = await Promise.all([
    checkExecutable(installScript),
    checkExecutable(manualScript),
  ])

  const [configExists, statusLogExists, mgmtExists] = await Promise.all([
    fileExists(configPath),
    fileExists(statusLogPath),
    fileExists(mgmtSock),
  ])

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-slate-400" />
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      </div>

      {/* Server Info card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Server className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-slate-900">Server Info</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoRow label="Config Path">
              <div className="flex items-center gap-2">
                <StatusIcon ok={configExists} />
                <span className="font-mono text-sm text-slate-800 break-all">{configPath}</span>
              </div>
            </InfoRow>
            <InfoRow label="Status Log">
              <div className="flex items-center gap-2">
                <StatusIcon ok={statusLogExists} />
                <span className="font-mono text-sm text-slate-800 break-all">{statusLogPath}</span>
              </div>
            </InfoRow>
            <InfoRow label="Management Socket">
              <div className="flex items-center gap-2">
                <StatusIcon ok={mgmtExists} />
                <span className="font-mono text-sm text-slate-800 break-all">{mgmtSock}</span>
              </div>
            </InfoRow>
            <InfoRow label="Install Script">
              <div className="flex items-center gap-2">
                <StatusIcon ok={installOk} />
                <span className="font-mono text-sm text-slate-800 break-all">{installScript}</span>
                {!installOk && (
                  <span className="text-xs text-red-500 whitespace-nowrap">not found / not executable</span>
                )}
              </div>
            </InfoRow>
            <InfoRow label="Manual OVPN Script">
              <div className="flex items-center gap-2">
                <StatusIcon ok={manualOk} />
                <span className="font-mono text-sm text-slate-800 break-all">{manualScript}</span>
                {!manualOk && (
                  <span className="text-xs text-red-500 whitespace-nowrap">not found / not executable</span>
                )}
              </div>
            </InfoRow>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Parsed from server.conf</p>
            <div className="flex flex-wrap gap-4">
              <Badge label="Port" value={port} />
              <Badge label="Proto" value={proto} />
              <Badge label="Dev" value={dev} />
            </div>
          </div>
        </div>
      </div>

      {/* Admin Account card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <User className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-slate-900">Admin Account</h2>
        </div>
        <div className="px-5 py-4 space-y-5">
          <InfoRow label="Current Username">
            <span className="font-mono text-sm font-medium text-slate-900">{session.username}</span>
          </InfoRow>

          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2 mb-4">
              <Key className="w-4 h-4 text-slate-400" />
              <h3 className="font-medium text-slate-900 text-sm">Change Password</h3>
            </div>
            <ChangePasswordForm />
          </div>
        </div>
      </div>

      {/* Environment Variables card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Environment Variables</h2>
          <p className="text-xs text-slate-500 mt-1">Effective values at startup. Sensitive values are masked.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Variable</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Value</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ENV_VARS.map(({ key, description, sensitive, defaultValue }) => {
                const rawValue = process.env[key]
                const isSet = rawValue !== undefined && rawValue !== ''
                const displayValue = sensitive
                  ? '***'
                  : (rawValue ?? defaultValue ?? '(not set)')
                const usingDefault = !isSet && defaultValue !== undefined

                return (
                  <tr key={key} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs text-slate-800 whitespace-nowrap">{key}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-700 break-all max-w-xs">
                      <span className={sensitive ? 'text-slate-400 italic' : ''}>
                        {displayValue}
                      </span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {isSet ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          Set
                        </span>
                      ) : usingDefault ? (
                        <span className="inline-flex items-center gap-1 text-xs text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                          Default
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          Not set
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{description}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      {children}
    </div>
  )
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg">
      <span className="text-xs text-slate-500">{label}:</span>
      <span className="font-mono text-sm font-medium text-slate-800">{value}</span>
    </div>
  )
}
