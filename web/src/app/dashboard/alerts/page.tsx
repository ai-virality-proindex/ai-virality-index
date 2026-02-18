'use client'

import { useEffect, useState, useCallback } from 'react'
import { createAuthBrowserClient } from '../../../lib/supabase'

type Alert = {
  id: string
  model_slug: string
  model_name: string
  model_color: string
  condition: string
  threshold: number | null
  mode: string
  channel: string
  webhook_url: string | null
  is_active: boolean
  last_triggered_at: string | null
  created_at: string
}

type HistoryItem = {
  id: string
  model_slug: string
  model_name: string
  condition: string
  triggered_value: number
  threshold: number
  message: string
  delivered: boolean
  created_at: string
}

type Model = {
  slug: string
  name: string
}

const CONDITIONS = [
  { value: 'vi_above', label: 'Index above', desc: 'Trigger when VI score exceeds threshold' },
  { value: 'vi_below', label: 'Index below', desc: 'Trigger when VI score drops below threshold' },
  { value: 'delta7_above', label: '7d change above', desc: 'Trigger when 7-day change exceeds value' },
  { value: 'delta7_below', label: '7d change below', desc: 'Trigger when 7-day change drops below value' },
  { value: 'new_signal', label: 'New signal', desc: 'Trigger on any new trading signal' },
]

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(true)
  const [isPro, setIsPro] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'alerts' | 'history'>('alerts')

  // Form state
  const [formSlug, setFormSlug] = useState('')
  const [formCondition, setFormCondition] = useState('vi_above')
  const [formThreshold, setFormThreshold] = useState('70')
  const [formMode, setFormMode] = useState('trade')
  const [formChannel, setFormChannel] = useState('webhook')
  const [formWebhookUrl, setFormWebhookUrl] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchAlerts = useCallback(async () => {
    const res = await fetch('/api/alerts')
    if (res.status === 401) {
      setAuthenticated(false)
      setLoading(false)
      return
    }
    if (res.status === 403) {
      setIsPro(false)
      setLoading(false)
      return
    }
    const json = await res.json()
    if (json.data) setAlerts(json.data)
    setLoading(false)
  }, [])

  const fetchHistory = useCallback(async () => {
    const res = await fetch('/api/alerts/history')
    if (res.ok) {
      const json = await res.json()
      if (json.data) setHistory(json.data)
    }
  }, [])

  const fetchModels = useCallback(async () => {
    const res = await fetch('/api/v1/models')
    if (res.ok) {
      const json = await res.json()
      if (json.data) {
        setModels(json.data)
        if (json.data.length > 0 && !formSlug) {
          setFormSlug(json.data[0].slug)
        }
      }
    }
  }, [formSlug])

  useEffect(() => {
    const supabase = createAuthBrowserClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setAuthenticated(false)
        setLoading(false)
      } else {
        fetchAlerts()
        fetchHistory()
        fetchModels()
      }
    })
  }, [fetchAlerts, fetchHistory, fetchModels])

  async function handleCreate() {
    setCreating(true)
    setError(null)

    const body: any = {
      model_slug: formSlug,
      condition: formCondition,
      mode: formMode,
      channel: formChannel,
    }

    if (formCondition !== 'new_signal') {
      body.threshold = parseFloat(formThreshold)
      if (isNaN(body.threshold)) {
        setError('Threshold must be a number')
        setCreating(false)
        return
      }
    }

    if (formChannel === 'webhook') {
      if (!formWebhookUrl) {
        setError('Webhook URL is required')
        setCreating(false)
        return
      }
      body.webhook_url = formWebhookUrl
    }

    const res = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const json = await res.json()
    if (json.error) {
      setError(json.error.message)
      setCreating(false)
      return
    }

    setCreating(false)
    setFormThreshold('70')
    setFormWebhookUrl('')
    fetchAlerts()
  }

  async function handleToggle(alertId: string, currentActive: boolean) {
    await fetch('/api/alerts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: alertId, is_active: !currentActive }),
    })
    fetchAlerts()
  }

  async function handleDelete(alertId: string) {
    await fetch(`/api/alerts?id=${alertId}`, { method: 'DELETE' })
    fetchAlerts()
  }

  function conditionLabel(condition: string): string {
    return CONDITIONS.find((c) => c.value === condition)?.label || condition
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Sign in required</h2>
          <p className="text-slate-400 mb-4">You need to sign in to manage alerts.</p>
          <a href="/login" className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500">
            Sign in
          </a>
        </div>
      </div>
    )
  }

  if (!isPro) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <svg className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Pro Feature</h2>
          <p className="text-slate-400 mb-4">Alerts are available for Pro subscribers.</p>
          <a href="/pricing" className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500">
            Upgrade to Pro
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Alerts</h1>
        <p className="mt-1 text-sm text-slate-400">
          Get notified when AI model scores cross your thresholds.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-avi-card p-1 border border-avi-border">
        <button
          onClick={() => setTab('alerts')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'alerts'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Active Alerts ({alerts.filter((a) => a.is_active).length})
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'history'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          History ({history.length})
        </button>
      </div>

      {tab === 'alerts' && (
        <>
          {/* Create alert form */}
          <div className="mb-8 rounded-xl border border-avi-border bg-avi-card p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Create new alert</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Model */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Model</label>
                <select
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                  className="w-full rounded-lg border border-avi-border bg-avi-dark px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                >
                  {models.map((m) => (
                    <option key={m.slug} value={m.slug}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Condition */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Condition</label>
                <select
                  value={formCondition}
                  onChange={(e) => setFormCondition(e.target.value)}
                  className="w-full rounded-lg border border-avi-border bg-avi-dark px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Threshold (hidden for new_signal) */}
              {formCondition !== 'new_signal' && (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Threshold</label>
                  <input
                    type="number"
                    value={formThreshold}
                    onChange={(e) => setFormThreshold(e.target.value)}
                    placeholder="e.g. 70"
                    className="w-full rounded-lg border border-avi-border bg-avi-dark px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {/* Mode */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Mode</label>
                <select
                  value={formMode}
                  onChange={(e) => setFormMode(e.target.value)}
                  className="w-full rounded-lg border border-avi-border bg-avi-dark px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                >
                  <option value="trade">Trading</option>
                  <option value="content">Content</option>
                </select>
              </div>

              {/* Channel */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Channel</label>
                <select
                  value={formChannel}
                  onChange={(e) => setFormChannel(e.target.value)}
                  className="w-full rounded-lg border border-avi-border bg-avi-dark px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                >
                  <option value="webhook">Webhook</option>
                  <option value="email">Email (coming soon)</option>
                </select>
              </div>

              {/* Webhook URL */}
              {formChannel === 'webhook' && (
                <div className="sm:col-span-2">
                  <label className="block text-sm text-slate-400 mb-1">Webhook URL</label>
                  <input
                    type="url"
                    value={formWebhookUrl}
                    onChange={(e) => setFormWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/... or https://discord.com/api/webhooks/..."
                    className="w-full rounded-lg border border-avi-border bg-avi-dark px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                  />
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating...' : 'Create alert'}
              </button>
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          </div>

          {/* Active alerts list */}
          <div className="rounded-xl border border-avi-border bg-avi-card">
            <div className="border-b border-avi-border px-6 py-4">
              <h2 className="text-lg font-semibold text-white">Your alerts</h2>
            </div>

            {loading ? (
              <div className="px-6 py-12 text-center text-slate-500">Loading...</div>
            ) : alerts.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-500">
                No alerts yet. Create one above.
              </div>
            ) : (
              <div className="divide-y divide-avi-border">
                {alerts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-6 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        {a.model_color && (
                          <div
                            className="h-3 w-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: a.model_color }}
                          />
                        )}
                        <span className="text-sm font-medium text-white">
                          {a.model_name}
                        </span>
                        <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                          {conditionLabel(a.condition)}
                          {a.threshold !== null && ` ${a.threshold}`}
                        </span>
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                          {a.mode === 'trade' ? 'Trading' : 'Content'}
                        </span>
                        {!a.is_active && (
                          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                            Paused
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
                        <span>{a.channel === 'webhook' ? 'Webhook' : 'Email'}</span>
                        <span>Created {new Date(a.created_at).toLocaleDateString()}</span>
                        {a.last_triggered_at && (
                          <span>Last fired {new Date(a.last_triggered_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                      <button
                        onClick={() => handleToggle(a.id, a.is_active)}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                          a.is_active
                            ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'
                            : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                        }`}
                      >
                        {a.is_active ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'history' && (
        <div className="rounded-xl border border-avi-border bg-avi-card">
          <div className="border-b border-avi-border px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Alert History</h2>
          </div>

          {history.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500">
              No alerts have fired yet.
            </div>
          ) : (
            <div className="divide-y divide-avi-border">
              {history.map((h) => (
                <div key={h.id} className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${h.delivered ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="text-sm font-medium text-white">{h.model_name}</span>
                    <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                      {conditionLabel(h.condition)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-300">{h.message}</p>
                  <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
                    <span>{new Date(h.created_at).toLocaleString()}</span>
                    <span>{h.delivered ? 'Delivered' : 'Failed'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
