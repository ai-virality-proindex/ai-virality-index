'use client'

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface ModelSeries {
  model: string
  name: string
  color: string
  data: { date: string; vi_trade: number; vi_content: number }[]
}

interface CompareChartProps {
  series: ModelSeries[]
  mode: 'trade' | 'content'
}

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
] as const

/**
 * Multi-model comparison chart (overlaid lines).
 */
export default function CompareChart({ series, mode }: CompareChartProps) {
  const [range, setRange] = useState<7 | 30 | 90>(30)

  if (series.length === 0) {
    return (
      <div className="rounded-xl bg-avi-card border border-avi-border p-12 text-center">
        <p className="text-slate-500">Select models to compare.</p>
      </div>
    )
  }

  const dataKey = mode === 'trade' ? 'vi_trade' : 'vi_content'

  // Merge all series into a single dataset keyed by date
  const dateMap = new Map<string, Record<string, number | string>>()
  for (const s of series) {
    const sliced = s.data.slice(-range)
    for (const point of sliced) {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, { date: point.date })
      }
      const row = dateMap.get(point.date)!
      row[s.model] = (point as any)[dataKey]
    }
  }

  const chartData = Array.from(dateMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string)
  )

  return (
    <div className="rounded-xl bg-avi-card border border-avi-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">
          {mode === 'trade' ? 'Trading Index' : 'Content Index'} Comparison
        </h3>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRange(r.days as 7 | 30 | 90)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                range === r.days
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: '100%', height: 350 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="date"
              stroke="#475569"
              fontSize={11}
              tickFormatter={(d) => {
                const date = new Date(d)
                return `${date.getMonth() + 1}/${date.getDate()}`
              }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis domain={[0, 100]} stroke="#475569" fontSize={11} width={35} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(value: number, name: string) => {
                const model = series.find((s) => s.model === name)
                return [value?.toFixed(1), model?.name || name]
              }}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Legend
              formatter={(value: string) => {
                const model = series.find((s) => s.model === value)
                return model?.name || value
              }}
              wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }}
            />
            {series.map((s) => (
              <Line
                key={s.model}
                type="monotone"
                dataKey={s.model}
                stroke={s.color || '#10B981'}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
