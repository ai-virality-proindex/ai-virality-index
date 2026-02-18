'use client'

import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts'

interface SparkLineProps {
  data: number[]
  color?: string
  height?: number
  showArea?: boolean
}

/**
 * Minimal sparkline chart using Recharts.
 * Shows a trend line without axes or labels.
 */
export default function SparkLine({
  data,
  color = '#10B981',
  height = 40,
  showArea = true,
}: SparkLineProps) {
  if (!data || data.length < 2) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <span className="text-xs text-slate-600">—</span>
      </div>
    )
  }

  const chartData = data.map((v, i) => ({ i, v }))

  // Auto-scale with padding
  const min = Math.min(...data)
  const max = Math.max(...data)
  const pad = (max - min) * 0.1 || 1
  const domainMin = Math.max(0, min - pad)
  const domainMax = max + pad

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <YAxis domain={[domainMin, domainMax]} hide />
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={showArea ? color : 'none'}
          fillOpacity={showArea ? 0.1 : 0}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
