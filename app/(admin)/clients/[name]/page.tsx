'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Download,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Shield,
  Wifi,
  XCircle,
} from 'lucide-react'
import ConfirmModal from '@/components/ConfirmModal'

interface ClientDetail {
  name: string
  certPath: string | null
  certExpiry: string | null
  hasKey: boolean
  hasCcd: boolean
  ccdContent: string | null
  ifconfigPush: string | null
  iroutes: string[]
  connected: boolean
  realAddress: string | null
  vpnAddress: string | null
  bytesReceived: number | null
  bytesSent: number | null
  connectedSince: string | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function CertExpiryInfo({ expiry }: { expiry: string | null }) {
  if (!expiry)
    return <span className="text-red-600 font-medium">Missing / Unknown</span>

  const date = new Date(expiry)
  const now = new Date()
  const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0)
    return (
      <span className="text-red-600 font-medium">
        Expired ({date.toLocaleDateString()})
      </span>
    )
  if (diffDays < 30)
    return (
      <span className="text-yellow-600 font-medium">
        {date.toLocaleDateString()} ({diffDays}d remaining)
      </span>
    )
  return (
    <span className="text-green-600 font-medium">
      {date.toLocaleDateString()} ({diffDays}d remaining)
    </span>
  )
}

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const name = decodeURIComponent(params.name as string)

  const [client, setClient] = useState<ClientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [ovpnConfig, setOvpnConfig] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [copied, setCopied] = useState(false)

  const [confirm, setConfirm] = useState<null | 'revoke' | 'disconnect'>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchClient = useCallback(async () => {
    try {
      const res = await fetch(`/api/openvpn/clients/${encodeURIComponent(name)}`)
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login'
          return
        }
        if (res.status === 404) {
          setError('Client not found')
          setLoading(false)
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const data: ClientDetail = await res.json()
      setClient(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch client')
    } finally {
      setLoading(false)
    }
  }, [name])

  useEffect(() => {
    fetchClient()
  }, [fetchClient])

  async function loadConfig() {
    setLoadingConfig(true)
    try {
      const res = await fetch(`/api/openvpn/clients/${encodeURIComponent(name)}/ovpn?view=true`, {
        headers: { 'X-Dashboard-Request': '1' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      setOvpnConfig(text)
      setShowConfig(true)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load config')
    } finally {
      setLoadingConfig(false)
    }
  }

  async function copyConfig() {
    if (!ovpnConfig) return
    await navigator.clipboard.writeText(ovpnConfig)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function executeAction(action: 'revoke' | 'disconnect') {
    setActionLoading(true)
    setActionError(null)
    const endpoint =
      action === 'revoke'
        ? `/api/openvpn/clients/${encodeURIComponent(name)}/revoke`
        : `/api/openvpn/clients/${encodeURIComponent(name)}/disconnect`

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'X-Dashboard-Request': '1' },
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      setConfirm(null)
      // Refresh client data
      await fetchClient()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 text-slate-300 animate-spin" />
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-12 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">{error ?? 'Client not found'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-slate-400 hover:text-slate-700 mt-0.5"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 font-mono">{client.name}</h1>
              {client.connected ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  Offline
                </span>
              )}
            </div>
            <p className="text-slate-500 text-sm mt-1">VPN Client Details</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {client.certPath && (
            <button
              onClick={() => setConfirm('revoke')}
              className="flex items-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium rounded-lg transition-colors"
            >
              <Shield className="w-4 h-4" />
              Revoke
            </button>
          )}
          {client.connected && (
            <button
              onClick={() => setConfirm('disconnect')}
              className="flex items-center gap-2 px-3 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 text-sm font-medium rounded-lg transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Disconnect
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {actionError}
        </div>
      )}

      {/* Info card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-slate-400" />
            Connection Info
          </h2>
        </div>
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Cert Expiry</p>
            <CertExpiryInfo expiry={client.certExpiry} />
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Has Key</p>
            <span className={client.hasKey ? 'text-green-600' : 'text-red-500'}>
              {client.hasKey ? 'Yes' : 'No'}
            </span>
          </div>
          {client.connected && (
            <>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Real Address</p>
                <span className="font-mono text-sm text-slate-800">{client.realAddress ?? '—'}</span>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">VPN IP</p>
                <span className="font-mono text-sm text-slate-800">{client.vpnAddress || '—'}</span>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Connected Since</p>
                <span className="text-sm text-slate-700">{client.connectedSince ?? '—'}</span>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Traffic (Rx / Tx)</p>
                <span className="text-sm text-slate-700">
                  {client.bytesReceived != null ? formatBytes(client.bytesReceived) : '—'} /{' '}
                  {client.bytesSent != null ? formatBytes(client.bytesSent) : '—'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* CCD card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Client Config Directory (CCD)</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          {client.hasCcd ? (
            <>
              {client.ifconfigPush && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">ifconfig-push</p>
                  <span className="font-mono text-sm text-slate-800">{client.ifconfigPush}</span>
                </div>
              )}
              {client.iroutes.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">iroutes</p>
                  <div className="space-y-1">
                    {client.iroutes.map((r, i) => (
                      <span key={i} className="block font-mono text-sm text-slate-800">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {client.ccdContent && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Raw CCD</p>
                  <pre className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">
                    {client.ccdContent}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <p className="text-slate-400 text-sm">No CCD file for this client.</p>
          )}
        </div>
      </div>

      {/* .ovpn section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">.ovpn Configuration</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <a
              href={`/api/openvpn/clients/${encodeURIComponent(name)}/ovpn`}
              download={`${name}.ovpn`}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Download .ovpn
            </a>
            <button
              onClick={showConfig ? () => setShowConfig(false) : loadConfig}
              disabled={loadingConfig}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loadingConfig ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : showConfig ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              {showConfig ? 'Hide Config' : 'View Config'}
            </button>
          </div>

          {showConfig && ovpnConfig && (
            <div className="relative">
              <button
                onClick={copyConfig}
                className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded hover:bg-slate-50 transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <pre className="bg-slate-900 text-green-400 rounded-xl px-4 py-5 text-xs overflow-x-auto whitespace-pre-wrap font-mono">
                {ovpnConfig}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation modals */}
      {confirm === 'revoke' && (
        <ConfirmModal
          title="Revoke Client Certificate"
          message={`Are you sure you want to revoke the certificate for "${client.name}"? This action cannot be undone and will permanently block this client from connecting.`}
          confirmLabel="Revoke Certificate"
          confirmVariant="danger"
          loading={actionLoading}
          onConfirm={() => executeAction('revoke')}
          onCancel={() => { setConfirm(null); setActionError(null) }}
        />
      )}
      {confirm === 'disconnect' && (
        <ConfirmModal
          title="Disconnect Client"
          message={`Are you sure you want to forcefully disconnect "${client.name}" from the VPN?`}
          confirmLabel="Disconnect"
          confirmVariant="warning"
          loading={actionLoading}
          onConfirm={() => executeAction('disconnect')}
          onCancel={() => { setConfirm(null); setActionError(null) }}
        />
      )}
    </div>
  )
}
