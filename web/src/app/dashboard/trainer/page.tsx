'use client'

import { useEffect, useState, useCallback } from 'react'
import { createAuthBrowserClient } from '../../../lib/supabase'
import { isTrainerUser } from '../../../lib/trainer-auth'
import { calculateOdds, type OddsResult } from '../../../lib/odds'

type Bet = {
  id: string
  model_slug: string
  model_name: string
  model_color: string
  direction: 'above' | 'below'
  threshold: number
  timeframe_days: number
  bet_amount: number
  odds: number
  implied_probability: number
  potential_payout: number
  index_at_bet: number
  status: 'active' | 'won' | 'lost'
  index_at_resolution: number | null
  payout: number
  placed_at: string
  expires_at: string
  resolved_at: string | null
}

type Stats = {
  total_bets: number
  active: number
  wins: number
  losses: number
  win_rate: number
  total_pnl: number
  roi_pct: number
}

type Model = {
  slug: string
  name: string
}

const TIMEFRAMES = [
  { value: 1, label: '1D' },
  { value: 3, label: '3D' },
  { value: 7, label: '7D' },
  { value: 14, label: '14D' },
]

export default function TrainerPage() {
  const [bets, setBets] = useState<Bet[]>([])
  const [balance, setBalance] = useState(1000)
  const [stats, setStats] = useState<Stats>({
    total_bets: 0, active: 0, wins: 0, losses: 0,
    win_rate: 0, total_pnl: 0, roi_pct: 0,
  })
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(true)
  const [authorized, setAuthorized] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'place' | 'active' | 'history'>('place')

  // Form state
  const [formSlug, setFormSlug] = useState('')
  const [formDirection, setFormDirection] = useState<'above' | 'below'>('above')
  const [formThreshold, setFormThreshold] = useState('70')
  const [formTimeframe, setFormTimeframe] = useState(7)
  const [formAmount, setFormAmount] = useState('50')
  const [placing, setPlacing] = useState(false)

  // Live odds preview
  const [oddsPreview, setOddsPreview] = useState<OddsResult | null>(null)
  const [modelHistory, setModelHistory] = useState<Record<string, number[]>>({})
  const [currentIndexes, setCurrentIndexes] = useState<Record<string, number>>({})

  const fetchBets = useCallback(async () => {
    const res = await fetch('/api/trainer/bets')
    if (res.status === 401) {
      setAuthenticated(false)
      setLoading(false)
      return
    }
    if (res.status === 403) {
      setAuthorized(false)
      setLoading(false)
      return
    }
    const json = await res.json()
    if (json.data) {
      setBets(json.data.bets)
      setBalance(json.data.balance)
      setStats(json.data.stats)
    }
    setLoading(false)
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

  // Fetch history for odds calculation when model changes
  const fetchModelData = useCallback(async (slug: string) => {
    if (modelHistory[slug]) {
      // Already cached
      return
    }
    try {
      const [histRes, latestRes] = await Promise.all([
        fetch(`/api/v1/index/history?model=${slug}&days=90`),
        fetch(`/api/v1/index/latest?model=${slug}`),
      ])
      if (histRes.ok) {
        const histJson = await histRes.json()
        if (histJson.data) {
          const scores = histJson.data.map((d: any) => d.vi_trade ?? d.vi)
          setModelHistory((prev) => ({ ...prev, [slug]: scores }))
        }
      }
      if (latestRes.ok) {
        const latestJson = await latestRes.json()
        if (latestJson.data) {
          const item = Array.isArray(latestJson.data) ? latestJson.data[0] : latestJson.data
          if (item) {
            setCurrentIndexes((prev) => ({ ...prev, [slug]: item.vi_trade ?? item.vi ?? 50 }))
          }
        }
      }
    } catch {
      // ignore
    }
  }, [modelHistory])

  useEffect(() => {
    const supabase = createAuthBrowserClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setAuthenticated(false)
        setLoading(false)
      } else if (!isTrainerUser(user.email)) {
        setAuthorized(false)
        setLoading(false)
      } else {
        fetchBets()
        fetchModels()
      }
    })
  }, [fetchBets, fetchModels])

  // Fetch model data when slug changes
  useEffect(() => {
    if (formSlug) {
      fetchModelData(formSlug)
    }
  }, [formSlug, fetchModelData])

  // Update odds preview when form values change
  useEffect(() => {
    const currentIndex = currentIndexes[formSlug]
    const history = modelHistory[formSlug]
    const threshold = parseFloat(formThreshold)

    if (currentIndex !== undefined && !isNaN(threshold) && threshold >= 0 && threshold <= 100) {
      const result = calculateOdds(
        currentIndex,
        threshold,
        formDirection,
        formTimeframe,
        history ?? []
      )
      setOddsPreview(result)
    } else {
      setOddsPreview(null)
    }
  }, [formSlug, formDirection, formThreshold, formTimeframe, currentIndexes, modelHistory])

  async function handlePlaceBet() {
    setPlacing(true)
    setError(null)

    const threshold = parseFloat(formThreshold)
    const amount = parseFloat(formAmount)

    if (isNaN(threshold) || threshold < 0 || threshold > 100) {
      setError('Threshold must be 0-100')
      setPlacing(false)
      return
    }

    if (isNaN(amount) || amount < 10 || amount > 500) {
      setError('Bet amount must be $10-$500')
      setPlacing(false)
      return
    }

    if (amount > balance) {
      setError(`Insufficient balance. Available: $${balance.toFixed(2)}`)
      setPlacing(false)
      return
    }

    const res = await fetch('/api/trainer/bet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_slug: formSlug,
        direction: formDirection,
        threshold,
        timeframe_days: formTimeframe,
        bet_amount: amount,
      }),
    })

    const json = await res.json()
    if (json.error) {
      setError(json.error.message)
      setPlacing(false)
      return
    }

    setPlacing(false)
    setError(null)
    fetchBets()
    setTab('active')
  }

  function daysLeft(expiresAt: string): number {
    const now = new Date()
    const exp = new Date(expiresAt)
    return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
  }

  // ── Access denied states ──

  if (!authenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Sign in required</h2>
          <p className="text-slate-400 mb-4">You need to sign in to access the trainer.</p>
          <a href="/login" className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500">
            Sign in
          </a>
        </div>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">This feature is available only for the project owner.</p>
        </div>
      </div>
    )
  }

  const activeBets = bets.filter((b) => b.status === 'active')
  const resolvedBets = bets.filter((b) => b.status !== 'active')
  const currentIndex = currentIndexes[formSlug]
  const potentialPayout = oddsPreview
    ? Math.round(parseFloat(formAmount || '0') * oddsPreview.odds * 100) / 100
    : 0

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          Polymarket Trainer
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Practice prediction market trading with AVI index data. Virtual $1,000 balance.
        </p>
      </div>

      {/* Stats bar */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-avi-border bg-avi-card p-4">
          <div className="text-xs text-slate-400">Balance</div>
          <div className={`text-xl font-bold ${balance >= 1000 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${balance.toFixed(2)}
          </div>
        </div>
        <div className="rounded-xl border border-avi-border bg-avi-card p-4">
          <div className="text-xs text-slate-400">Total P&L</div>
          <div className={`text-xl font-bold ${stats.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {stats.total_pnl >= 0 ? '+' : ''}{stats.total_pnl.toFixed(2)}
          </div>
        </div>
        <div className="rounded-xl border border-avi-border bg-avi-card p-4">
          <div className="text-xs text-slate-400">Win Rate</div>
          <div className="text-xl font-bold text-white">
            {stats.win_rate.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-xl border border-avi-border bg-avi-card p-4">
          <div className="text-xs text-slate-400">ROI</div>
          <div className={`text-xl font-bold ${stats.roi_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {stats.roi_pct >= 0 ? '+' : ''}{stats.roi_pct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-avi-card p-1 border border-avi-border">
        <button
          onClick={() => setTab('place')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'place' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Place Bet
        </button>
        <button
          onClick={() => setTab('active')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'active' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Active ({activeBets.length})
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'history' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          History ({resolvedBets.length})
        </button>
      </div>

      {/* ── Place Bet Tab ── */}
      {tab === 'place' && (
        <div className="rounded-xl border border-avi-border bg-avi-card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">New prediction</h2>

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
              {currentIndex !== undefined && (
                <p className="mt-1 text-xs text-slate-500">
                  Current index: <span className="text-white font-medium">{currentIndex.toFixed(1)}</span>
                </p>
              )}
            </div>

            {/* Threshold */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Target threshold</label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={formThreshold}
                onChange={(e) => setFormThreshold(e.target.value)}
                className="w-full rounded-lg border border-avi-border bg-avi-dark px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
              />
            </div>

            {/* Direction */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Direction</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFormDirection('above')}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    formDirection === 'above'
                      ? 'border-emerald-500 bg-emerald-600 text-white'
                      : 'border-avi-border text-slate-400 hover:text-white'
                  }`}
                >
                  ABOVE
                </button>
                <button
                  onClick={() => setFormDirection('below')}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    formDirection === 'below'
                      ? 'border-red-500 bg-red-600 text-white'
                      : 'border-avi-border text-slate-400 hover:text-white'
                  }`}
                >
                  BELOW
                </button>
              </div>
            </div>

            {/* Timeframe */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Timeframe</label>
              <div className="flex gap-2">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.value}
                    onClick={() => setFormTimeframe(tf.value)}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                      formTimeframe === tf.value
                        ? 'border-emerald-500 bg-emerald-600 text-white'
                        : 'border-avi-border text-slate-400 hover:text-white'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bet amount */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Bet amount ($10-$500)</label>
              <input
                type="number"
                min={10}
                max={500}
                step={10}
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="w-full rounded-lg border border-avi-border bg-avi-dark px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
              />
            </div>

            {/* Live odds preview */}
            <div className="flex items-end">
              {oddsPreview && (
                <div className="w-full rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Odds</span>
                    <span className="text-xl font-bold text-amber-400">{oddsPreview.odds}x</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-400">Potential payout</span>
                    <span className="text-sm font-semibold text-emerald-400">
                      ${potentialPayout.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-400">Probability</span>
                    <span className="text-xs text-slate-300">
                      {(oddsPreview.impliedProbability * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Summary line */}
          {oddsPreview && currentIndex !== undefined && (
            <div className="mt-4 rounded-lg bg-avi-dark p-3 text-sm text-slate-300">
              Prediction: <span className="text-white font-medium">
                {models.find((m) => m.slug === formSlug)?.name ?? formSlug}
              </span> will be{' '}
              <span className={formDirection === 'above' ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                {formDirection.toUpperCase()} {formThreshold}
              </span>{' '}
              in <span className="text-white font-medium">{formTimeframe} day{formTimeframe > 1 ? 's' : ''}</span>.
              Currently at <span className="text-white font-medium">{currentIndex.toFixed(1)}</span>.
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handlePlaceBet}
              disabled={placing || !oddsPreview}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            >
              {placing ? 'Placing...' : `Place bet — $${formAmount}`}
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </div>
      )}

      {/* ── Active Bets Tab ── */}
      {tab === 'active' && (
        <div className="rounded-xl border border-avi-border bg-avi-card">
          <div className="border-b border-avi-border px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Active bets</h2>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center text-slate-500">Loading...</div>
          ) : activeBets.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500">
              No active bets. Place one to start trading.
            </div>
          ) : (
            <div className="divide-y divide-avi-border">
              {activeBets.map((bet) => (
                <div key={bet.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {bet.model_color && (
                        <div
                          className="h-3 w-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: bet.model_color }}
                        />
                      )}
                      <span className="text-sm font-medium text-white">{bet.model_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        bet.direction === 'above'
                          ? 'bg-emerald-900/30 text-emerald-400'
                          : 'bg-red-900/30 text-red-400'
                      }`}>
                        {bet.direction.toUpperCase()} {bet.threshold}
                      </span>
                      <span className="rounded-full bg-blue-900/30 px-2 py-0.5 text-xs text-blue-400">
                        {daysLeft(bet.expires_at)}d left
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-amber-400">{bet.odds}x</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-6 text-xs text-slate-500">
                    <span>Bet: <span className="text-white">${bet.bet_amount}</span></span>
                    <span>Payout: <span className="text-emerald-400">${bet.potential_payout.toFixed(2)}</span></span>
                    <span>Index at bet: {bet.index_at_bet.toFixed(1)}</span>
                    <span>Expires: {new Date(bet.expires_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === 'history' && (
        <div className="rounded-xl border border-avi-border bg-avi-card">
          <div className="border-b border-avi-border px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Bet history</h2>
          </div>

          {resolvedBets.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500">
              No resolved bets yet. Results appear when active bets expire.
            </div>
          ) : (
            <div className="divide-y divide-avi-border">
              {resolvedBets.map((bet) => {
                const pnl = bet.status === 'won'
                  ? bet.payout - bet.bet_amount
                  : -bet.bet_amount
                return (
                  <div key={bet.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {bet.model_color && (
                          <div
                            className="h-3 w-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: bet.model_color }}
                          />
                        )}
                        <span className="text-sm font-medium text-white">{bet.model_name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          bet.direction === 'above'
                            ? 'bg-emerald-900/30 text-emerald-400'
                            : 'bg-red-900/30 text-red-400'
                        }`}>
                          {bet.direction.toUpperCase()} {bet.threshold}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          bet.status === 'won'
                            ? 'bg-emerald-900/30 text-emerald-400'
                            : 'bg-red-900/30 text-red-400'
                        }`}>
                          {bet.status === 'won' ? 'WIN' : 'LOSS'}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-6 text-xs text-slate-500">
                      <span>Bet: ${bet.bet_amount}</span>
                      <span>Odds: {bet.odds}x</span>
                      <span>Index: {bet.index_at_bet.toFixed(1)} → {bet.index_at_resolution?.toFixed(1) ?? '?'}</span>
                      <span>{bet.resolved_at ? new Date(bet.resolved_at).toLocaleDateString() : ''}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
