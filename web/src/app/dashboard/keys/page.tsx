'use client'

import { useEffect, useState, useCallback } from 'react'
import { createAuthBrowserClient } from '../../../lib/supabase'

type ApiKey = {
  id: string
  prefix: string
  name: string
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authenticated, setAuthenticated] = useState(true)

  const fetchKeys = useCallback(async () => {
    const res = await fetch('/api/keys')
    if (res.status === 401) {
      setAuthenticated(false)
      setLoading(false)
      return
    }
    const json = await res.json()
    if (json.data) setKeys(json.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    // Check auth first
    const supabase = createAuthBrowserClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setAuthenticated(false)
        setLoading(false)
      } else {
        fetchKeys()
      }
    })
  }, [fetchKeys])

  async function handleCreate() {
    setCreating(true)
    setError(null)

    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newKeyName || 'Default' }),
    })

    const json = await res.json()
    if (json.error) {
      setError(json.error.message)
      setCreating(false)
      return
    }

    setNewKeyValue(json.data.key)
    setNewKeyName('')
    setCreating(false)
    fetchKeys()
  }

  async function handleRevoke(keyId: string) {
    const res = await fetch(`/api/keys?id=${keyId}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.data?.revoked) {
      fetchKeys()
    }
  }

  function handleCopy() {
    if (newKeyValue) {
      navigator.clipboard.writeText(newKeyValue)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Sign in required</h2>
          <p className="text-slate-400 mb-4">You need to sign in to manage API keys.</p>
          <a href="/login" className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500">
            Sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">API Keys</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage your API keys for programmatic access to AVI data.
        </p>
      </div>

      {/* New key modal */}
      {newKeyValue && (
        <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
              <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-300">Your new API key</p>
              <p className="mt-1 text-xs text-slate-400">Copy it now. It won&apos;t be shown again.</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-avi-dark px-4 py-3 font-mono text-sm text-white break-all">
                  {newKeyValue}
                </code>
                <button
                  onClick={handleCopy}
                  className="flex-shrink-0 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <button
              onClick={() => setNewKeyValue(null)}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Create key form */}
      <div className="mb-8 rounded-xl border border-avi-border bg-avi-card p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Create new key</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. Production, Development)"
            className="flex-1 rounded-lg border border-avi-border bg-avi-dark px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Creating...' : 'Create key'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      {/* Usage example */}
      <div className="mb-8 rounded-xl border border-avi-border bg-avi-card p-6">
        <h2 className="text-lg font-semibold text-white mb-3">Usage</h2>
        <pre className="rounded-lg bg-avi-dark p-4 text-sm text-slate-300 overflow-x-auto">
          <code>{`curl -H "Authorization: Bearer avi_pk_your_key_here" \\
  https://aiviralityindex.com/api/v1/index/latest`}</code>
        </pre>
      </div>

      {/* Keys list */}
      <div className="rounded-xl border border-avi-border bg-avi-card">
        <div className="border-b border-avi-border px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Your keys</h2>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-slate-500">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500">
            No API keys yet. Create one above.
          </div>
        ) : (
          <div className="divide-y divide-avi-border">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-white">{k.name}</span>
                    {!k.is_active && (
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                        Revoked
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
                    <code>{k.prefix}</code>
                    <span>Created {new Date(k.created_at).toLocaleDateString()}</span>
                    {k.last_used_at && (
                      <span>Last used {new Date(k.last_used_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                {k.is_active && (
                  <button
                    onClick={() => handleRevoke(k.id)}
                    className="ml-4 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
