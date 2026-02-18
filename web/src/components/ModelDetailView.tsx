'use client'

import { useState, useCallback } from 'react'
import IndexGauge from './IndexGauge'
import IndexChart from './IndexChart'
import BreakdownRadar from './BreakdownRadar'
import ModeToggle from './ModeToggle'
import UpdateCountdown from './UpdateCountdown'
import { getIndexColor, formatDelta } from '@/lib/utils'

interface HistoryPoint {
  date: string
  vi_trade: number
  vi_content: number
  signal_trade: number | null
  heat_content: number | null
  delta7_trade: number | null
  delta7_content: number | null
}

interface ComponentData {
  component: string
  label: string
  normalized_value: number
  smoothed_value: number | null
  delta: number | null
}

interface Signal {
  signal_type: string
  direction: string
  strength: number
  reasoning: string
  date: string
  expires_at: string | null
}

interface ModelDetailViewProps {
  model: {
    slug: string
    name: string
    company: string
    color: string
  }
  latestScore: {
    vi_trade: number
    vi_content: number
    delta7_trade: number | null
    delta7_content: number | null
    accel_trade: number | null
    accel_content: number | null
    date: string
  } | null
  history: HistoryPoint[]
  breakdown: ComponentData[]
  signals: Signal[]
  lastFetchedAt: string | null
}

export default function ModelDetailView({
  model,
  latestScore,
  history,
  breakdown,
  signals,
  lastFetchedAt,
}: ModelDetailViewProps) {
  const [mode, setMode] = useState<'trade' | 'content'>('trade')

  const vi = latestScore
    ? mode === 'trade' ? latestScore.vi_trade : latestScore.vi_content
    : 0
  const delta = latestScore
    ? mode === 'trade' ? latestScore.delta7_trade : latestScore.delta7_content
    : null
  const accel = latestScore
    ? mode === 'trade'
      ? (latestScore as any).accel_trade
      : (latestScore as any).accel_content
    : null

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white shrink-0"
            style={{ backgroundColor: model.color || '#3B82F6' }}
          >
            {model.name?.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{model.name}</h1>
            <p className="text-sm text-slate-500">{model.company}</p>
          </div>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {latestScore ? (
        <>
          {/* Gauge row */}
          <div className="grid sm:grid-cols-3 gap-6">
            {/* Main gauge */}
            <div className="flex justify-center">
              <IndexGauge
                value={vi}
                label={mode === 'trade' ? 'Trading Index' : 'Content Index'}
                size="lg"
              />
            </div>

            {/* Momentum card */}
            <div className="rounded-xl bg-avi-card border border-avi-border p-5">
              <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Momentum</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">7-Day Change</p>
                  <div className="flex items-center gap-2">
                    {delta != null ? (
                      <>
                        <span className={`text-2xl font-bold ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatDelta(delta)}
                        </span>
                        <span className={`text-lg ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {delta >= 0 ? '↑' : '↓'}
                        </span>
                      </>
                    ) : (
                      <span className="text-xl text-slate-600">—</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Acceleration</p>
                  <div className="flex items-center gap-2">
                    {accel != null ? (
                      <>
                        <span className={`text-xl font-bold ${accel >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatDelta(accel)}
                        </span>
                        <span className={`text-sm ${accel >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {accel > 0 ? '⚡ accelerating' : accel < 0 ? '🔻 decelerating' : '— flat'}
                        </span>
                      </>
                    ) : (
                      <span className="text-lg text-slate-600">—</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="rounded-xl bg-avi-card border border-avi-border p-5">
              <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Scores</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">Trading</span>
                  <span className="text-lg font-bold" style={{ color: getIndexColor(latestScore.vi_trade) }}>
                    {latestScore.vi_trade.toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">Content</span>
                  <span className="text-lg font-bold" style={{ color: getIndexColor(latestScore.vi_content) }}>
                    {latestScore.vi_content.toFixed(1)}
                  </span>
                </div>
                <div className="pt-2 border-t border-avi-border">
                  <UpdateCountdown lastDate={lastFetchedAt || latestScore.date} variant="full" />
                </div>
              </div>
            </div>
          </div>

          {/* Chart */}
          <IndexChart
            data={history}
            modelColor={model.color || '#10B981'}
            modelName={model.name}
            mode={mode}
          />

          {/* Breakdown + Signals row */}
          <div className="grid sm:grid-cols-2 gap-6">
            {/* Radar */}
            <BreakdownRadar
              data={breakdown}
              modelColor={model.color || '#10B981'}
              blurred={breakdown.length === 0}
            />

            {/* Signals */}
            <div className="rounded-xl bg-avi-card border border-avi-border p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Active Signals</h3>
              {signals.length > 0 ? (
                <div className="space-y-3">
                  {signals.map((sig, i) => (
                    <div
                      key={i}
                      className="rounded-lg bg-slate-800/50 p-3 border border-avi-border"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          {sig.signal_type.replace(/_/g, ' ')}
                        </span>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${
                            sig.direction === 'bullish'
                              ? 'bg-emerald-900/30 text-emerald-400'
                              : 'bg-red-900/30 text-red-400'
                          }`}
                        >
                          {sig.direction}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300">{sig.reasoning}</p>
                      <div className="flex justify-between mt-2 text-xs text-slate-500">
                        <span>Strength: {sig.strength?.toFixed(0)}/100</span>
                        {sig.expires_at && <span>Expires: {sig.expires_at}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-500 mb-1">No active signals</p>
                  <p className="text-xs text-slate-600">
                    Signals appear when index diverges from market odds.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Embed widget code */}
          <EmbedCodeSection slug={model.slug} />
        </>
      ) : (
        <div className="rounded-xl bg-avi-card border border-avi-border p-16 text-center">
          <p className="text-slate-400 text-lg mb-2">No Data Yet</p>
          <p className="text-sm text-slate-600">
            Index data for {model.name} will appear after the ETL pipeline runs.
          </p>
        </div>
      )}
    </div>
  )
}

function EmbedCodeSection({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const embedCode = `<iframe src="https://aiviralityindex.com/embed/${slug}" width="320" height="200" frameborder="0" style="border:none;border-radius:12px;"></iframe>`

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [embedCode])

  return (
    <div className="rounded-xl bg-avi-card border border-avi-border p-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-semibold text-white w-full text-left"
      >
        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
        </svg>
        Get Embed Code
        <svg
          className={`w-4 h-4 text-slate-500 ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-slate-400">
            Embed this widget on your website or blog. Copy the iframe code below:
          </p>
          <div className="relative">
            <pre className="bg-slate-900 rounded-lg p-3 text-xs text-slate-300 overflow-x-auto border border-avi-border">
              {embedCode}
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Preview: <a href={`/embed/${slug}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">/embed/{slug}</a>
          </p>
        </div>
      )}
    </div>
  )
}
