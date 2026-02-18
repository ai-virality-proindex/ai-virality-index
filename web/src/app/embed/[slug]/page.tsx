import { createServerClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'

export const revalidate = 3600 // ISR: 1 hour

export async function generateStaticParams() {
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('models')
      .select('slug')
      .eq('is_active', true)
    return (data ?? []).map((m: any) => ({ slug: m.slug }))
  } catch {
    return [
      { slug: 'chatgpt' },
      { slug: 'gemini' },
      { slug: 'claude' },
      { slug: 'perplexity' },
      { slug: 'deepseek' },
      { slug: 'grok' },
      { slug: 'copilot' },
    ]
  }
}

async function getEmbedData(slug: string) {
  const supabase = createServerClient()

  const { data: model } = await supabase
    .from('models')
    .select('id, slug, name, company, color')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!model) return null

  // 30-day history for sparkline
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 31)
  const fromStr = thirtyDaysAgo.toISOString().split('T')[0]

  const { data: historyRaw } = await supabase
    .from('daily_scores')
    .select('date, vi_trade, delta7_trade')
    .eq('model_id', model.id)
    .gte('date', fromStr)
    .order('date', { ascending: true })

  const history = (historyRaw ?? []).map((r: any) => ({
    date: r.date,
    value: Number(r.vi_trade),
  }))

  const latest = history.length > 0 ? history[history.length - 1] : null
  const delta7 = historyRaw && historyRaw.length > 0
    ? Number(historyRaw[historyRaw.length - 1].delta7_trade)
    : null

  return {
    model: { slug: model.slug, name: model.name, company: model.company, color: model.color },
    score: latest?.value ?? null,
    date: latest?.date ?? null,
    delta7,
    sparkline: history.map(h => h.value),
  }
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 280
  const h = 40
  const pad = 2

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x},${y}`
  })

  // Area fill path
  const firstX = pad
  const lastX = pad + ((data.length - 1) / (data.length - 1)) * (w - pad * 2)
  const areaPath = `M${points[0]} ${points.slice(1).map(p => `L${p}`).join(' ')} L${lastX},${h} L${firstX},${h} Z`

  return (
    <div className="avi-widget-sparkline">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#sparkFill)" />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points.join(' ')}
        />
      </svg>
    </div>
  )
}

function scoreColor(score: number): string {
  if (score >= 70) return '#10b981'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}

export default async function EmbedPage({
  params,
}: {
  params: { slug: string }
}) {
  const data = await getEmbedData(params.slug)

  if (!data || data.score === null) {
    return (
      <div className="avi-widget-empty">
        Model not found
      </div>
    )
  }

  const { model, score, date, delta7, sparkline } = data
  const sColor = scoreColor(score)
  const deltaClass = delta7 !== null ? (delta7 > 0 ? 'positive' : delta7 < 0 ? 'negative' : 'neutral') : 'neutral'
  const deltaStr = delta7 !== null
    ? `${delta7 > 0 ? '+' : ''}${delta7.toFixed(1)} 7d`
    : ''

  return (
    <div className="avi-widget">
      <div className="avi-widget-header">
        <span className="avi-widget-dot" style={{ background: model.color }} />
        <span className="avi-widget-name">{model.name}</span>
        <span className="avi-widget-company">{model.company}</span>
      </div>

      <div className="avi-widget-score-row">
        <span className="avi-widget-score" style={{ color: sColor }}>
          {score.toFixed(1)}
        </span>
        <span className="avi-widget-label">Virality Index</span>
      </div>

      {deltaStr && (
        <div className={`avi-widget-delta ${deltaClass}`}>
          {deltaStr}
        </div>
      )}

      <Sparkline data={sparkline} color={model.color} />

      <div className="avi-widget-footer">
        <a
          href="https://aiviralityindex.com"
          target="_blank"
          rel="noopener noreferrer"
          className="avi-widget-powered"
        >
          Powered by AI Virality Index
        </a>
        {date && <span className="avi-widget-date">{date}</span>}
      </div>
    </div>
  )
}
