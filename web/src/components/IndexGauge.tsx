'use client'

import { getIndexColor, getIndexLabel } from '@/lib/utils'

interface IndexGaugeProps {
  value: number
  label?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Semi-circle gauge (Fear & Greed style) with segmented color arc.
 * Segments follow the arc path: red → orange → yellow → green.
 */
export default function IndexGauge({ value, label, size = 'md' }: IndexGaugeProps) {
  const color = getIndexColor(value)
  const indexLabel = getIndexLabel(value)
  const clamped = Math.max(0, Math.min(100, value))

  // Size presets
  const dims = {
    sm: { w: 140, h: 95, cx: 70, cy: 75, r: 55, stroke: 10, textSize: 'text-2xl', labelSize: 'text-xs' },
    md: { w: 200, h: 130, cx: 100, cy: 100, r: 75, stroke: 12, textSize: 'text-4xl', labelSize: 'text-sm' },
    lg: { w: 280, h: 175, cx: 140, cy: 140, r: 105, stroke: 16, textSize: 'text-5xl', labelSize: 'text-base' },
  }
  const d = dims[size]

  // Color segments for the background arc (along the arc path)
  const segments = [
    { startPct: 0, endPct: 20, color: '#EF4444' },   // red: 0-20
    { startPct: 20, endPct: 40, color: '#F97316' },   // orange: 20-40
    { startPct: 40, endPct: 60, color: '#EAB308' },   // yellow: 40-60
    { startPct: 60, endPct: 80, color: '#22C55E' },   // green: 60-80
    { startPct: 80, endPct: 100, color: '#10B981' },   // emerald: 80-100
  ]

  // Helper: get point on arc for a given percentage (0-100)
  function arcPoint(pct: number) {
    const angle = (pct / 100) * 180
    const rad = (angle * Math.PI) / 180
    return {
      x: d.cx - d.r * Math.cos(rad),
      y: d.cy - d.r * Math.sin(rad),
    }
  }

  // Build arc path between two percentages
  function arcSegmentPath(startPct: number, endPct: number) {
    const start = arcPoint(startPct)
    const end = arcPoint(endPct)
    const angleDiff = ((endPct - startPct) / 100) * 180
    const largeArc = angleDiff > 90 ? 1 : 0
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${d.r} ${d.r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
  }

  // Needle position
  const needleAngle = (clamped / 100) * 180
  const needleRad = (needleAngle * Math.PI) / 180
  const needleX = d.cx - d.r * Math.cos(needleRad)
  const needleY = d.cy - d.r * Math.sin(needleRad)

  // Needle line (shorter, from center outward)
  const needleInnerR = d.r - d.stroke * 1.5
  const needleOuterR = d.r + d.stroke * 0.8
  const innerX = d.cx - needleInnerR * Math.cos(needleRad)
  const innerY = d.cy - needleInnerR * Math.sin(needleRad)
  const outerX = d.cx - needleOuterR * Math.cos(needleRad)
  const outerY = d.cy - needleOuterR * Math.sin(needleRad)

  return (
    <div className="flex flex-col items-center">
      {label && <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">{label}</p>}
      <svg width={d.w} height={d.h} viewBox={`0 0 ${d.w} ${d.h}`}>
        {/* Background arc segments (dim) */}
        {segments.map((seg, i) => (
          <path
            key={i}
            d={arcSegmentPath(seg.startPct, seg.endPct)}
            fill="none"
            stroke={seg.color}
            strokeWidth={d.stroke}
            strokeLinecap="butt"
            opacity={0.2}
          />
        ))}

        {/* Active arc segments (bright, up to current value) */}
        {segments.map((seg, i) => {
          if (clamped <= seg.startPct) return null
          const effectiveEnd = Math.min(clamped, seg.endPct)
          return (
            <path
              key={`active-${i}`}
              d={arcSegmentPath(seg.startPct, effectiveEnd)}
              fill="none"
              stroke={seg.color}
              strokeWidth={d.stroke}
              strokeLinecap="butt"
              opacity={0.9}
            />
          )
        })}

        {/* Round caps on the ends */}
        {(() => {
          const startPt = arcPoint(0)
          const endPt = arcPoint(100)
          return (
            <>
              <circle cx={startPt.x} cy={startPt.y} r={d.stroke / 2} fill="#EF4444" opacity={0.2} />
              <circle cx={endPt.x} cy={endPt.y} r={d.stroke / 2} fill="#10B981" opacity={0.2} />
            </>
          )
        })()}

        {/* Needle line */}
        <line
          x1={innerX.toFixed(2)}
          y1={innerY.toFixed(2)}
          x2={outerX.toFixed(2)}
          y2={outerY.toFixed(2)}
          stroke="white"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* Needle dot */}
        <circle
          cx={needleX.toFixed(2)}
          cy={needleY.toFixed(2)}
          r={d.stroke / 2.5}
          fill="white"
          stroke={color}
          strokeWidth={2}
        />
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
