'use client'

interface SparkLineProps {
  data: number[]
  color?: string
  height?: number
  showArea?: boolean
}

/**
 * Minimal sparkline using pure SVG (no external library).
 * Renders a trend line + optional filled area.
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

  const width = 200 // fixed SVG width, will stretch via CSS
  const pad = 2     // internal padding

  // Auto-scale Y
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const yPad = range * 0.1

  // Map data to SVG points
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2)
    const y = pad + ((max + yPad - v) / (range + yPad * 2)) * (height - pad * 2)
    return { x, y }
  })

  // Build polyline string
  const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  // Build area polygon (line + bottom edge)
  const areaPolygon = [
    ...points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `${points[points.length - 1].x.toFixed(1)},${height}`,
    `${points[0].x.toFixed(1)},${height}`,
  ].join(' ')

  const gradId = `spark-grad-${Math.random().toString(36).slice(2, 8)}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      {showArea && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <polygon
            points={areaPolygon}
            fill={`url(#${gradId})`}
          />
        </>
      )}
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
