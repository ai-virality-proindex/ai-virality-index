'use client'

import { useState, useRef, useEffect } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { getIndexColor } from '@/lib/utils'

interface DataPoint {
  date: string
  vi_trade: number
  vi_content: number
  signal_trade: number | null
  heat_content: number | null
  delta7_trade: number | null
  delta7_content: number | null
}

interface IndexChartProps {
  data: DataPoint[]
  modelColor: string
  modelName: string
  mode: 'trade' | 'content'
}

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
] as const

/**
 * Full time-series chart with time range toggle.
 * Shows VI_trade or VI_content as an area chart.
 */
export default function IndexChart({ data, modelColor, modelName, mode }: IndexChartProps) {
  const [range, setRange] = useState<7 | 30 | 90>(30)

  // Filter data by range
  const sliced = data.slice(-range)

  if (sliced.length === 0) {
    return (
      <div className="rounded-xl bg-avi-card border border-avi-border p-12 text-center">
        <p className="text-slate-500">No chart data available yet.</p>
      </div>
    )
  }

  const dataKey = mode === 'trade' ? 'vi_trade' : 'vi_content'
  const lineColor = modelColor || '#10B981'

  // Y domain
  const values = sliced.map((d) => (d as any)[dataKey] as number).filter(Boolean)
  const yMin = Math.max(0, Math.floor(Math.min(...values) - 5))
  const yMax = Math.min(100, Math.ceil(Math.max(...values) + 5))

  return (
    <div className="rounded-xl bg-avi-card border border-avi-border p-5">
      {/* Header with range toggle */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">
          {modelName} — {mode === 'trade' ? 'Trading Index' : 'Content Index'}
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

      {/* Chart — wrapped in a div with explicit dimensions for SSR compatibility */}
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sliced} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id={`chartGrad-${mode}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
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
            <YAxis
              domain={[yMin, yMax]}
              stroke="#475569"
              fontSize={11}
              width={35}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#94a3b8' }}
              itemStyle={{ color: lineColor }}
              formatter={(value: number) => [value.toFixed(1), mode === 'trade' ? 'Trading' : 'Content']}
              labelFormatter={(label) => `Date: ${label}`}
            />
            {/* Reference lines for zones */}
            <ReferenceLine y={50} stroke="#334155" strokeDasharray="5 5" />
            <ReferenceLine y={75} stroke="#334155" strokeDasharray="3 3" />
            <ReferenceLine y={25} stroke="#334155" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={lineColor}
              strokeWidth={2}
              fill={`url(#chartGrad-${mode})`}
              dot={false}
              activeDot={{ r: 4, fill: lineColor }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
