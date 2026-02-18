'use client'

import { getIndexColor, getIndexLabel } from '@/lib/utils'
import { ModelScore } from './ModelCard'
import Link from 'next/link'

interface HeatMapProps {
  scores: ModelScore[]
  mode: 'trade' | 'content'
}

/**
 * Heatmap grid: model cards colored by their VI score.
 * Darker = lower, brighter = higher.
 */
export default function HeatMap({ scores, mode }: HeatMapProps) {
  const getVi = (s: ModelScore) => mode === 'trade' ? s.vi_trade : s.vi_content

  // Sort by score descending
  const sorted = [...scores].sort((a, b) => getVi(b) - getVi(a))

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl bg-avi-card border border-avi-border p-12 text-center">
        <p className="text-slate-400 mb-2">No data yet</p>
        <p className="text-sm text-slate-600">Heatmap will populate after ETL runs.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {sorted.map((score) => {
        const vi = getVi(score)
        const color = getIndexColor(vi)
        // Opacity based on score intensity
        const intensity = Math.max(0.15, vi / 100)

        return (
          <Link
            key={score.model}
            href={`/models/${score.model}`}
            className="relative rounded-lg p-4 border border-avi-border hover:border-slate-500 transition-all group overflow-hidden"
            style={{
              backgroundColor: color + Math.round(intensity * 25).toString(16).padStart(2, '0'),
            }}
          >
            {/* Background glow */}
            <div
              className="absolute inset-0 opacity-10"
              style={{
                background: `radial-gradient(circle at center, ${color}, transparent 70%)`,
              }}
            />
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: score.color || '#3B82F6' }}
                >
                  {score.name?.charAt(0)}
                </div>
                <span className="text-xs font-medium text-white/80 truncate">
                  {score.name}
                </span>
              </div>
              <p className="text-2xl font-bold text-white">{vi?.toFixed(1)}</p>
              <p className="text-[10px] text-white/50">{getIndexLabel(vi)}</p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
