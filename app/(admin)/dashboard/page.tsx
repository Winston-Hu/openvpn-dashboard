import { getConnectedClients, getKnownClients, getServerInfo } from '@/lib/openvpn'
import { requireSession } from '@/lib/auth'
import { Wifi, Users, Clock, Server, ArrowUpDown } from 'lucide-react'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default async function DashboardPage() {
  await requireSession()

  const [connectedClients, knownClients, serverInfo] = await Promise.all([
    getConnectedClients(),
    getKnownClients(),
    getServerInfo(),
  ])

  const stats = [
    {
      label: 'Connected Clients',
      value: connectedClients.length,
      icon: Wifi,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Total Known Clients',
      value: knownClients.length,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Server Status',
      value: serverInfo.running ? 'Running' : 'Unknown',
      icon: Server,
      color: serverInfo.running ? 'text-green-600' : 'text-slate-500',
      bg: serverInfo.running ? 'bg-green-50' : 'bg-slate-100',
    },
    {
      label: 'Last Updated',
      value: serverInfo.statusLastUpdated ?? 'N/A',
      icon: Clock,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      small: true,
    },
  ]

  const recentConnections = connectedClients.slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">OpenVPN server overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg, small }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-500">{label}</span>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            <div className={`font-bold ${color} ${small ? 'text-sm' : 'text-2xl'}`}>
              {String(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Server status badge */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
            serverInfo.running
              ? 'bg-green-100 text-green-700'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              serverInfo.running ? 'bg-green-500' : 'bg-slate-400'
            }`}
          />
          {serverInfo.running ? 'OpenVPN Running' : 'OpenVPN Status Unknown'}
        </span>
        <span className="text-xs text-slate-400">
          Config: {serverInfo.configPath}
        </span>
      </div>

      {/* Recent connections */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-slate-400" />
            Recent Connections
          </h2>
        </div>

        {recentConnections.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Wifi className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No active connections</p>
            <p className="text-slate-400 text-xs mt-1">
              Connected clients will appear here once OpenVPN is running
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Common Name
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Real Address
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    VPN IP
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Rx / Tx
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Connected Since
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentConnections.map((client) => (
                  <tr
                    key={client.commonName + client.realAddress}
                    className="border-b border-slate-50 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {client.commonName}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{client.realAddress}</td>
                    <td className="px-5 py-3 text-slate-600">{client.vpnAddress || '—'}</td>
                    <td className="px-5 py-3 text-slate-600 text-xs">
                      {formatBytes(client.bytesReceived)} / {formatBytes(client.bytesSent)}
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">
                      {client.connectedSince}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
