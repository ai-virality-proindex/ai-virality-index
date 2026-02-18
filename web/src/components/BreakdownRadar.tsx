'use client'

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
  M: 'Market',
}

const COMPONENT_COLORS: Record<string, string> = {
  T: '#10B981',
  S: '#3B82F6',
  G: '#8B5CF6',
  N: '#F59E0B',
  Q: '#EC4899',
  M: '#EF4444',
}

/**
 * Radar chart showing T/S/G/N/Q/M component breakdown.
 * Can be blurred for non-Pro users.
 */
export default function BreakdownRadar({ data, modelColor, blurred = false }: BreakdownRadarProps) {
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

      <ResponsiveContainer width="100%" height={280}>
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
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value: number, name: string) => [
              value.toFixed(1),
              'Score',
            ]}
          />
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

      {/* Component legend with values */}
      <div className="grid grid-cols-3 gap-2 mt-2">
        {chartData.map((c) => (
          <div key={c.code} className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: COMPONENT_COLORS[c.code] || '#94a3b8' }}
            />
            <span className="text-xs text-slate-400">{c.component}</span>
            <span className="text-xs font-medium text-white ml-auto">
              {c.value.toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
