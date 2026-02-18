'use client'

import { getIndexColor, formatDelta, getIndexLabel } from '@/lib/utils'
import SparkLine from './SparkLine'
import Link from 'next/link'

export interface ModelScore {
  model: string
  name: string
  company: string
  color: string
  date: string
  vi_trade: number
  vi_content: number
  signal_trade: number | null
  heat_content: number | null
  delta7_trade: number | null
  delta7_content: number | null
  component_breakdown: Record<string, number> | null
}

interface ModelCardProps {
  score: ModelScore
  mode: 'trade' | 'content'
  history?: number[]  // sparkline data (last 7-30 days)
}

/**
 * Model card showing name, score, delta badge, and sparkline.
 * Links to /models/[slug].
 */
export default function ModelCard({ score, mode, history }: ModelCardProps) {
  const vi = mode === 'trade' ? score.vi_trade : score.vi_content
  const delta = mode === 'trade' ? score.delta7_trade : score.delta7_content
  const color = getIndexColor(vi)
  const label = getIndexLabel(vi)

  return (
    <Link
      href={`/models/${score.model}`}
      className="block rounded-xl bg-avi-card border border-avi-border p-5 hover:border-slate-500 transition-all hover:shadow-lg hover:shadow-black/20 group"
    >
      {/* Header: avatar + name */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
          style={{ backgroundColor: score.color || '#3B82F6' }}
        >
          {score.name?.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white truncate group-hover:text-avi-green transition-colors">
            {score.name}
          </p>
          <p className="text-xs text-slate-500 truncate">{score.company}</p>
        </div>
      </div>

      {/* Sparkline */}
      {history && history.length >= 2 && (
        <div className="mb-3">
          <SparkLine data={history} color={color} height={36} />
        </div>
      )}

      {/* Score + Delta */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold leading-none" style={{ color }}>
            {vi?.toFixed(1)}
          </p>
          <p className="text-xs text-slate-500 mt-1">{label}</p>
        </div>
        {delta != null && (
          <div
            className={`text-sm font-medium px-2 py-0.5 rounded ${
              delta >= 0
                ? 'bg-emerald-900/30 text-emerald-400'
                : 'bg-red-900/30 text-red-400'
            }`}
          >
            {formatDelta(delta)} 7d
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(vi, 100)}%`, backgroundColor: color }}
        />
      </div>
    </Link>
  )
}
