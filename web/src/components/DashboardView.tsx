'use client'

import { useState, useEffect } from 'react'
import IndexGauge from './IndexGauge'
import ModelCard, { ModelScore } from './ModelCard'
import HeatMap from './HeatMap'
import TopMovers from './TopMovers'
import ModeToggle from './ModeToggle'
import UpdateCountdown from './UpdateCountdown'
import UpsellBanner from './UpsellBanner'
import WelcomeModal from './WelcomeModal'
import { useUserPlan } from '../hooks/useUserPlan'

interface DashboardViewProps {
  scores: ModelScore[]
  historyMap: Record<string, number[]>       // slug -> last N vi_trade values
  historyContentMap: Record<string, number[]> // slug -> last N vi_content values
  lastDate: string | null
  lastFetchedAt: string | null
}

/**
 * Client-side dashboard view with mode toggle.
 * Receives server-fetched data as props.
 */
export default function DashboardView({
  scores,
  historyMap,
  historyContentMap,
  lastDate,
  lastFetchedAt,
}: DashboardViewProps) {
  const [mode, setMode] = useState<'trade' | 'content'>('trade')
  const { plan, loading: planLoading } = useUserPlan()
  const showUpsell = !planLoading && (plan === 'anon' || plan === 'free')

  // Welcome modal after checkout
  const [showWelcome, setShowWelcome] = useState(false)
  const [welcomePlan, setWelcomePlan] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('welcome') === 'true') {
      const completed = localStorage.getItem('onboarding_completed')
      if (!completed) {
        setWelcomePlan(params.get('plan') || 'pro_trader_monthly')
        setShowWelcome(true)
      }
      window.history.replaceState({}, '', '/dashboard')
    }
  }, [])

  // Calculate market average
  const getVi = (s: ModelScore) => mode === 'trade' ? s.vi_trade : s.vi_content
  const avg =
    scores.length > 0
      ? scores.reduce((sum, s) => sum + getVi(s), 0) / scores.length
      : 0

  // Sort by score
  const sorted = [...scores].sort((a, b) => getVi(b) - getVi(a))

  // Get history for current mode
  const currentHistoryMap = mode === 'trade' ? historyMap : historyContentMap

  return (
    <div className="space-y-8">
      {showWelcome && (
        <WelcomeModal plan={welcomePlan} onClose={() => setShowWelcome(false)} />
      )}

      {/* Header row: title + toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          {lastDate && (
            <div className="mt-1">
              <UpdateCountdown lastDate={lastFetchedAt || lastDate} />
            </div>
          )}
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {scores.length === 0 ? (
        <div className="rounded-xl bg-avi-card border border-avi-border p-16 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <p className="text-slate-400 text-lg mb-2">No Index Data Yet</p>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            The dashboard will populate after the ETL pipeline runs and calculates index scores.
            Data is updated daily.
          </p>
        </div>
      ) : (
        <>
          {showUpsell && <UpsellBanner variant="dashboard-delay" />}

          {/* Gauge + Summary row */}
          <div className="grid sm:grid-cols-3 gap-6">
            {/* Center gauge */}
            <div className="sm:col-span-1 flex justify-center">
              <IndexGauge
                value={avg}
                label={mode === 'trade' ? 'Market Average (Trading)' : 'Market Average (Content)'}
                size="lg"
              />
            </div>
            {/* Top 3 quick stats */}
            <div className="sm:col-span-2 grid grid-cols-3 gap-3">
              {sorted.slice(0, 3).map((s, i) => {
                const vi = getVi(s)
                const color = getIndexColor(vi)
                return (
                  <div
                    key={s.model}
                    className="rounded-xl bg-avi-card border border-avi-border p-4 text-center"
                  >
                    <p className="text-xs text-slate-500 mb-1">
                      #{i + 1} {mode === 'trade' ? 'Trading' : 'Content'}
                    </p>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white mx-auto mb-2"
                      style={{ backgroundColor: s.color || '#3B82F6' }}
                    >
                      {s.name?.charAt(0)}
                    </div>
                    <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                    <p className="text-2xl font-bold mt-1" style={{ color }}>
                      {vi?.toFixed(1)}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Heatmap */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">Heatmap</h2>
            <HeatMap scores={scores} mode={mode} />
          </div>

          {/* Model cards grid */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">All Models</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sorted.map((s) => (
                <ModelCard
                  key={s.model}
                  score={s}
                  mode={mode}
                  history={currentHistoryMap[s.model]}
                />
              ))}
            </div>
          </div>

          {/* Top movers */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">Top Movers (7d)</h2>
            <TopMovers scores={scores} mode={mode} />
          </div>
        </>
      )}
    </div>
  )
}

// Re-export for inline usage in this file
function getIndexColor(value: number): string {
  if (value <= 25) return '#EF4444'
  if (value <= 50) return '#F59E0B'
  if (value <= 75) return '#EAB308'
  return '#10B981'
}
