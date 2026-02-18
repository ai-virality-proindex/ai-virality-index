'use client'

import { getIndexColor, formatDelta } from '@/lib/utils'
import { ModelScore } from './ModelCard'
import Link from 'next/link'

interface TopMoversProps {
  scores: ModelScore[]
  mode: 'trade' | 'content'
}

/**
 * Shows the top gainers and losers by 7-day delta.
 * Split into two columns: gainers (green) and losers (red).
 */
export default function TopMovers({ scores, mode }: TopMoversProps) {
  const getDelta = (s: ModelScore) =>
    mode === 'trade' ? s.delta7_trade : s.delta7_content

  // Sort by delta, filter out null deltas
  const withDelta = scores.filter((s) => getDelta(s) != null)
  const sorted = [...withDelta].sort(
    (a, b) => (getDelta(b) ?? 0) - (getDelta(a) ?? 0)
  )

  const gainers = sorted.filter((s) => (getDelta(s) ?? 0) > 0).slice(0, 3)
  const losers = sorted
    .filter((s) => (getDelta(s) ?? 0) < 0)
    .reverse()
    .slice(0, 3)

  if (gainers.length === 0 && losers.length === 0) {
    return (
      <div className="rounded-xl bg-avi-card border border-avi-border p-8 text-center">
        <p className="text-slate-500 text-sm">
          No movers yet. Delta data requires 7+ days of history.
        </p>
      </div>
    )
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {/* Gainers */}
      <div className="rounded-xl bg-avi-card border border-avi-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">
            Top Gainers
          </h3>
        </div>
        {gainers.length > 0 ? (
          <div className="space-y-1">
            {gainers.map((s, i) => (
              <MoverRow key={s.model} score={s} delta={getDelta(s)!} rank={i + 1} mode={mode} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-600">No gainers</p>
        )}
      </div>

      {/* Losers */}
      <div className="rounded-xl bg-avi-card border border-avi-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider">
            Top Losers
          </h3>
        </div>
        {losers.length > 0 ? (
          <div className="space-y-1">
            {losers.map((s, i) => (
              <MoverRow key={s.model} score={s} delta={getDelta(s)!} rank={i + 1} mode={mode} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-600">No losers</p>
        )}
      </div>
    </div>
  )
}

function MoverRow({
  score,
  delta,
  rank,
  mode,
}: {
  score: ModelScore
  delta: number
  rank: number
  mode: 'trade' | 'content'
}) {
  const vi = mode === 'trade' ? score.vi_trade : score.vi_content
  const color = getIndexColor(vi)
  const isUp = delta >= 0

  return (
    <Link
      href={`/models/${score.model}`}
      className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-slate-800/50 transition-colors group"
    >
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-600 w-4">{rank}</span>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ backgroundColor: score.color || '#3B82F6' }}
        >
          {score.name?.charAt(0)}
        </div>
        <div>
          <p className="text-sm font-medium text-white group-hover:text-avi-green transition-colors">
            {score.name}
          </p>
          <p className="text-xs text-slate-500">{vi?.toFixed(1)}</p>
        </div>
      </div>
      <div
        className={`text-sm font-semibold ${
          isUp ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {formatDelta(delta)}
      </div>
    </Link>
  )
}
