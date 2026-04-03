'use client'

import { useEffect, useState, useCallback } from 'react'
import { Wifi, RefreshCw, AlertCircle } from 'lucide-react'

interface ConnectedClient {
  commonName: string
  realAddress: string
  vpnAddress: string
  bytesReceived: number
  bytesSent: number
  connectedSince: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function OnlineClientsPage() {
  const [clients, setClients] = useState<ConnectedClient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchClients = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const res = await fetch('/api/openvpn/clients/connected')
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login'
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const data: ConnectedClient[] = await res.json()
      setClients(data)
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch clients')
    } finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchClients()
    const interval = setInterval(() => fetchClients(), 30_000)
    return () => clearInterval(interval)
  }, [fetchClients])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Online Clients</h1>
          <p className="text-slate-500 text-sm mt-1">
            Currently connected VPN clients &mdash; auto-refreshes every 30s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-slate-400">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => fetchClients(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {loading ? (
          <div className="px-5 py-12 text-center">
            <RefreshCw className="w-8 h-8 text-slate-300 mx-auto mb-3 animate-spin" />
            <p className="text-slate-500 text-sm">Loading clients...</p>
          </div>
        ) : error ? (
          <div className="px-5 py-12 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-slate-700 text-sm font-medium">Failed to load clients</p>
            <p className="text-slate-400 text-xs mt-1">{error}</p>
          </div>
        ) : clients.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Wifi className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No clients currently connected</p>
            <p className="text-slate-400 text-xs mt-1">
              Connected clients will appear here once they join the VPN
            </p>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                {clients.length} connected
              </span>
            </div>
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
                      Bytes Rx
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Bytes Tx
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Connected Since
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr
                      key={client.commonName + client.realAddress}
                      className="border-b border-slate-50 hover:bg-slate-50"
                    >
                      <td className="px-5 py-3 font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                          {client.commonName}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600 font-mono text-xs">
                        {client.realAddress}
                      </td>
                      <td className="px-5 py-3 text-slate-600 font-mono text-xs">
                        {client.vpnAddress || '—'}
                      </td>
                      <td className="px-5 py-3 text-slate-600 text-xs">
                        {formatBytes(client.bytesReceived)}
                      </td>
                      <td className="px-5 py-3 text-slate-600 text-xs">
                        {formatBytes(client.bytesSent)}
                      </td>
                      <td className="px-5 py-3 text-slate-500 text-xs">
                        {client.connectedSince}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
