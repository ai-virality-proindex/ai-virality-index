'use client'

import { getIndexColor, getIndexLabel } from '@/lib/utils'

interface IndexGaugeProps {
  value: number
  label?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Circular 0-100 gauge component (Fear & Greed style).
 * Semi-circle arc from red (0) to green (100).
 */
export default function IndexGauge({ value, label, size = 'md' }: IndexGaugeProps) {
  const color = getIndexColor(value)
  const indexLabel = getIndexLabel(value)
  const clamped = Math.max(0, Math.min(100, value))

  // Size presets
  const dims = {
    sm: { w: 140, h: 85, cx: 70, cy: 70, r: 55, stroke: 8, textSize: 'text-2xl', labelSize: 'text-xs' },
    md: { w: 200, h: 120, cx: 100, cy: 95, r: 75, stroke: 10, textSize: 'text-4xl', labelSize: 'text-sm' },
    lg: { w: 280, h: 165, cx: 140, cy: 130, r: 105, stroke: 14, textSize: 'text-5xl', labelSize: 'text-base' },
  }
  const d = dims[size]

  // Gradient stops for background arc (multicolor)
  const gradientId = `gauge-grad-${size}`

  // Value arc
  const angle = (clamped / 100) * 180
  const rad = (angle * Math.PI) / 180
  const x = d.cx - d.r * Math.cos(rad)
  const y = d.cy - d.r * Math.sin(rad)
  const largeArc = angle > 90 ? 1 : 0
  const arcPath = angle > 0
    ? `M ${d.cx - d.r} ${d.cy} A ${d.r} ${d.r} 0 ${largeArc} 1 ${x.toFixed(2)} ${y.toFixed(2)}`
    : ''
  const bgPath = `M ${d.cx - d.r} ${d.cy} A ${d.r} ${d.r} 0 1 1 ${d.cx + d.r} ${d.cy}`

  return (
    <div className="flex flex-col items-center">
      {label && <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">{label}</p>}
      <svg width={d.w} height={d.h} viewBox={`0 0 ${d.w} ${d.h}`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#EF4444" />
            <stop offset="35%" stopColor="#F59E0B" />
            <stop offset="65%" stopColor="#EAB308" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
        </defs>
        {/* Background arc (gradient) */}
        <path
          d={bgPath}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={d.stroke}
          strokeLinecap="round"
          opacity={0.2}
        />
        {/* Active arc */}
        {arcPath && (
          <path
            d={arcPath}
            fill="none"
            stroke={color}
            strokeWidth={d.stroke}
            strokeLinecap="round"
          />
        )}
        {/* Needle tick */}
        <circle cx={x.toFixed(2)} cy={y.toFixed(2)} r={d.stroke / 2.5} fill={color} />
      </svg>
      <span className={`${d.textSize} font-bold text-white -mt-2`}>
        {Math.round(clamped)}
      </span>
      <span className={`${d.labelSize} mt-0.5 font-medium`} style={{ color }}>
        {indexLabel}
      </span>
    </div>
  )
}
