'use client'

import { useState } from 'react'
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

interface ComponentData {
  component: string
  label: string
  normalized_value: number
  smoothed_value: number | null
  delta: number | null
}

interface BreakdownRadarProps {
  data: ComponentData[]
  modelColor: string
  blurred?: boolean  // true for free users (Pro only feature)
}

const COMPONENT_LABELS: Record<string, string> = {
  T: 'Search',
  S: 'Social',
  G: 'GitHub',
  N: 'News',
  Q: 'Quality',
  M: 'Mindshare',
}

const COMPONENT_COLORS: Record<string, string> = {
  T: '#10B981',
  S: '#3B82F6',
  G: '#8B5CF6',
  N: '#F59E0B',
  Q: '#EC4899',
  M: '#EF4444',
}

const COMPONENT_HINTS: Record<string, { source: string; desc: string }> = {
  T: { source: 'Google Trends', desc: 'Search volume and rising queries for the model' },
  S: { source: 'YouTube + HackerNews', desc: 'Videos, views, engagement, and community discussion' },
  G: { source: 'GitHub API', desc: 'Stars, forks velocity, and issue activity' },
  N: { source: 'GDELT', desc: 'Global news mentions count and sentiment' },
  Q: { source: 'LMArena', desc: 'Elo rating from head-to-head model comparisons' },
  M: { source: 'Wikipedia', desc: 'Daily pageviews — measures public information-seeking interest' },
}

/** Threshold: deltas smaller than this are treated as "no change" */
const DELTA_THRESHOLD = 0.5

/** Custom Recharts tooltip with component descriptions + delta */
function CustomRadarTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null
  const entry = payload[0].payload
  const code = entry.code
  const hint = COMPONENT_HINTS[code]
  const delta = entry.delta as number | null

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-xl max-w-[220px]">
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: COMPONENT_COLORS[code] || '#94a3b8' }}
        />
        <span className="text-sm font-semibold text-white">{entry.component}</span>
        <span className="text-lg font-bold text-white ml-auto">{entry.value.toFixed(1)}</span>
      </div>
      {delta != null && Math.abs(delta) >= DELTA_THRESHOLD && (
        <p className={`text-xs font-medium mb-1 ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {delta > 0 ? '▲' : '▼'} {delta > 0 ? '+' : ''}{delta.toFixed(1)} vs previous update
        </p>
      )}
      {hint && (
        <>
          <p className="text-[11px] text-slate-400 leading-snug">{hint.desc}</p>
          <p className="text-[10px] text-slate-500 mt-1">Source: {hint.source}</p>
        </>
      )}
    </div>
  )
}

/**
 * Radar chart showing T/S/G/N/Q/M component breakdown.
 * Can be blurred for non-Pro users.
 */
export default function BreakdownRadar({ data, modelColor, blurred = false }: BreakdownRadarProps) {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null)

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl bg-avi-card border border-avi-border p-8 text-center">
        <p className="text-slate-500 text-sm">No breakdown data available.</p>
      </div>
    )
  }

  const chartData = data.map((d) => ({
    component: COMPONENT_LABELS[d.component] || d.component,
    code: d.component,
    value: Number(d.smoothed_value ?? d.normalized_value),
    delta: d.delta,
    fullMark: 100,
  }))

  return (
    <div className="rounded-xl bg-avi-card border border-avi-border p-5 relative">
      <h3 className="text-sm font-semibold text-white mb-2">Component Breakdown</h3>

      {blurred && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-avi-card/80 backdrop-blur-sm rounded-xl">
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-300 mb-2">Pro Feature</p>
            <p className="text-xs text-slate-500">Upgrade to see component details</p>
          </div>
        </div>
      )}

      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="#334155" />
            <PolarAngleAxis
              dataKey="component"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: '#475569', fontSize: 10 }}
              tickCount={5}
            />
            <Tooltip content={<CustomRadarTooltip />} />
            <Radar
              name="Score"
              dataKey="value"
              stroke={modelColor || '#10B981'}
              fill={modelColor || '#10B981'}
              fillOpacity={0.25}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Component legend: compact values + delta arrows + hover tooltips */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 mt-2">
        {chartData.map((c) => {
          const hint = COMPONENT_HINTS[c.code]
          const delta = c.delta
          const showDelta = delta != null && Math.abs(delta) >= DELTA_THRESHOLD

          return (
            <div
              key={c.code}
              className="relative flex items-center gap-1.5 rounded px-1.5 py-1 cursor-default hover:bg-slate-800/60 transition-colors group"
              onMouseEnter={() => setHoveredCode(c.code)}
              onMouseLeave={() => setHoveredCode(null)}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: COMPONENT_COLORS[c.code] || '#94a3b8' }}
              />
              <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
                {c.component}
              </span>
              <span className="text-xs font-semibold text-white">
                {c.value.toFixed(0)}
              </span>
              {showDelta && (
                <span className={`text-[10px] font-medium ${delta! > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {delta! > 0 ? '▲' : '▼'}
                </span>
              )}

              {/* Tooltip on hover */}
              {hoveredCode === c.code && hint && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 w-52 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-xl pointer-events-none">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-xs font-semibold text-white">{c.component} ({c.code})</p>
                    {showDelta && (
                      <span className={`text-[11px] font-medium ${delta! > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {delta! > 0 ? '▲+' : '▼'}{delta!.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">{hint.desc}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Source: {hint.source}</p>
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-600" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
