'use client'

import { useState } from 'react'
import { X, Loader2, Download, CheckCircle } from 'lucide-react'

interface CreateClientModalProps {
  onClose: () => void
  onCreated?: (name: string) => void
}

export default function CreateClientModal({ onClose, onCreated }: CreateClientModalProps) {
  const [name, setName] = useState('')
  const [ifconfigPush, setIfconfigPush] = useState('')
  const [iroute, setIroute] = useState('')
  const [irouteMask, setIrouteMask] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const [createdName, setCreatedName] = useState('')

  const nameValid = /^[a-zA-Z0-9-]{1,32}$/.test(name)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameValid) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/openvpn/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dashboard-Request': '1',
        },
        body: JSON.stringify({
          name,
          ifconfigPush: ifconfigPush || undefined,
          iroute: iroute || undefined,
          irouteMask: irouteMask || undefined,
        }),
      })

      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login'
          return
        }
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
      }

      setCreatedName(name)
      setCreated(true)
      onCreated?.(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create client')
    } finally {
      setLoading(false)
    }
  }

  function handleDownload() {
    window.location.href = `/api/openvpn/clients/${encodeURIComponent(createdName)}/ovpn`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Create Client</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {created ? (
          <div className="px-6 py-8 text-center space-y-4">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <div>
              <p className="text-lg font-semibold text-slate-900">Client created!</p>
              <p className="text-slate-500 text-sm mt-1">
                <span className="font-mono font-medium">{createdName}</span> has been
                created. Download the .ovpn config file below.
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Download .ovpn
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {/* Client name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. alice-laptop"
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  name && !nameValid
                    ? 'border-red-400 bg-red-50'
                    : 'border-slate-300'
                }`}
                required
              />
              {name && !nameValid && (
                <p className="text-xs text-red-500 mt-1">
                  Only letters, numbers, and hyphens. Max 32 characters.
                </p>
              )}
            </div>

            {/* ifconfig-push */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                IP Address (ifconfig-push){' '}
                <span className="text-slate-400 font-normal">optional</span>
              </label>
              <input
                type="text"
                value={ifconfigPush}
                onChange={(e) => setIfconfigPush(e.target.value)}
                placeholder="e.g. 10.8.0.10 255.255.255.0"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* iroute */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Static Route Network (iroute){' '}
                <span className="text-slate-400 font-normal">optional</span>
              </label>
              <input
                type="text"
                value={iroute}
                onChange={(e) => setIroute(e.target.value)}
                placeholder="e.g. 192.168.10.0"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* iroute mask — shown when iroute is filled */}
            {iroute && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Static Route Mask (iroute-mask){' '}
                  <span className="text-slate-400 font-normal">optional</span>
                </label>
                <input
                  type="text"
                  value={irouteMask}
                  onChange={(e) => setIrouteMask(e.target.value)}
                  placeholder="e.g. 255.255.255.0"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !nameValid}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Creating…' : 'Create Client'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
