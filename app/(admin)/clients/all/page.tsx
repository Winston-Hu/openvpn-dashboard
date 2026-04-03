'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Users, RefreshCw, AlertCircle, Plus, Check, X as XIcon } from 'lucide-react'
import CreateClientModal from '@/components/CreateClientModal'

interface AllClient {
  name: string
  certPath: string | null
  hasKey: boolean
  hasCcd: boolean
  certExpiry: string | null
  connected: boolean
}

function CertExpiryBadge({ expiry }: { expiry: string | null }) {
  if (!expiry) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
        Missing
      </span>
    )
  }

  const date = new Date(expiry)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
        Expired
      </span>
    )
  }

  if (diffDays < 30) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
        {date.toLocaleDateString()} ({diffDays}d)
      </span>
    )
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
      {date.toLocaleDateString()}
    </span>
  )
}

export default function AllClientsPage() {
  const [clients, setClients] = useState<AllClient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchClients = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const res = await fetch('/api/openvpn/clients/all')
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login'
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const data: AllClient[] = await res.json()
      setClients(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch clients')
    } finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  function handleCreated() {
    setShowCreateModal(false)
    fetchClients(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">All Clients</h1>
          <p className="text-slate-500 text-sm mt-1">All known VPN clients from PKI</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchClients(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Client
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {loading ? (
          <div className="px-5 py-12 text-center">
            <RefreshCw className="w-8 h-8 text-slate-300 mx-auto mb-3 animate-spin" />
            <p className="text-slate-500 text-sm">Loading clients…</p>
          </div>
        ) : error ? (
          <div className="px-5 py-12 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-slate-700 text-sm font-medium">Failed to load clients</p>
            <p className="text-slate-400 text-xs mt-1">{error}</p>
          </div>
        ) : clients.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No clients found</p>
            <p className="text-slate-400 text-xs mt-1">
              Create a client to get started
            </p>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-slate-100">
              <span className="text-xs text-slate-500 font-medium">
                {clients.length} client{clients.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Cert Expiry
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Has Key
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Has CCD
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr
                      key={client.name}
                      className="border-b border-slate-50 hover:bg-slate-50"
                    >
                      <td className="px-5 py-3 font-medium text-slate-900 font-mono text-xs">
                        {client.name}
                      </td>
                      <td className="px-5 py-3">
                        {client.connected ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            Connected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Offline
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <CertExpiryBadge expiry={client.certExpiry} />
                      </td>
                      <td className="px-5 py-3">
                        {client.hasKey ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <XIcon className="w-4 h-4 text-slate-300" />
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {client.hasCcd ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <XIcon className="w-4 h-4 text-slate-300" />
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/clients/${encodeURIComponent(client.name)}`}
                          className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showCreateModal && (
        <CreateClientModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
