import { createServerClient } from '@/lib/supabase'
import ModelDetailView from '@/components/ModelDetailView'
import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const revalidate = 3600 // ISR: 1 hour

// --- Static params for 7 models ---

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

// --- Dynamic metadata ---

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const supabase = createServerClient()
  const { data: model } = await supabase
    .from('models')
    .select('name, company')
    .eq('slug', params.slug)
    .eq('is_active', true)
    .single()

  const name = model?.name || params.slug
  return {
    title: `${name} Virality Index — AI Virality Index`,
    description: `Real-time virality tracking for ${name}. See trading index, content index, momentum, and component breakdown.`,
    openGraph: {
      title: `${name} — AI Virality Index`,
      description: `Virality tracking for ${name} by ${model?.company || 'unknown'}`,
    },
  }
}

// --- Data fetching ---

async function getModelData(slug: string) {
  const supabase = createServerClient()

  // 1. Get model info
  const { data: model, error: modelErr } = await supabase
    .from('models')
    .select('id, slug, name, company, color')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (modelErr || !model) return null

  // 2. Get 90-day history
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 91)
  const fromStr = ninetyDaysAgo.toISOString().split('T')[0]

  const { data: historyRaw } = await supabase
    .from('daily_scores')
    .select('date, vi_trade, vi_content, signal_trade, heat_content, delta7_trade, delta7_content, accel_trade, accel_content')
    .eq('model_id', model.id)
    .gte('date', fromStr)
    .order('date', { ascending: true })

  const history = (historyRaw ?? []).map((row: any) => ({
    date: row.date,
    vi_trade: Number(row.vi_trade),
    vi_content: Number(row.vi_content),
    signal_trade: row.signal_trade != null ? Number(row.signal_trade) : null,
    heat_content: row.heat_content != null ? Number(row.heat_content) : null,
    delta7_trade: row.delta7_trade != null ? Number(row.delta7_trade) : null,
    delta7_content: row.delta7_content != null ? Number(row.delta7_content) : null,
  }))

  // Latest score (with accel)
  const latestRow = historyRaw && historyRaw.length > 0
    ? historyRaw[historyRaw.length - 1]
    : null
  const latestScore = latestRow
    ? {
        vi_trade: Number(latestRow.vi_trade),
        vi_content: Number(latestRow.vi_content),
        delta7_trade: latestRow.delta7_trade != null ? Number(latestRow.delta7_trade) : null,
        delta7_content: latestRow.delta7_content != null ? Number(latestRow.delta7_content) : null,
        accel_trade: latestRow.accel_trade != null ? Number(latestRow.accel_trade) : null,
        accel_content: latestRow.accel_content != null ? Number(latestRow.accel_content) : null,
        date: latestRow.date,
      }
    : null

  // 3. Get component breakdown (latest 2 days for delta calculation)
  const { data: breakdownRaw } = await supabase
    .from('component_scores')
    .select('date, component, normalized_value, smoothed_value')
    .eq('model_id', model.id)
    .order('date', { ascending: false })
    .limit(12) // T, S, G, N, Q, M × 2 days

  const LABELS: Record<string, string> = {
    T: 'Search Interest',
    S: 'Social Buzz',
    G: 'Developer Adoption',
    N: 'News Coverage',
    Q: 'Quality Score',
    M: 'Market Conviction',
  }

  // Separate into latest day and previous day
  const byDate: Record<string, Record<string, number>> = {}
  for (const r of (breakdownRaw ?? []) as any[]) {
    if (!byDate[r.date]) byDate[r.date] = {}
    const val = r.smoothed_value != null ? Number(r.smoothed_value) : Number(r.normalized_value)
    byDate[r.date][r.component] = val
  }
  const sortedDates = Object.keys(byDate).sort().reverse() // newest first
  const latestMap = byDate[sortedDates[0]] ?? {}
  const prevMap = byDate[sortedDates[1]] ?? {}

  // Deduplicate by component (keep latest) + compute delta
  const seenComp = new Set<string>()
  const breakdown = (breakdownRaw ?? [])
    .filter((r: any) => {
      if (seenComp.has(r.component)) return false
      seenComp.add(r.component)
      return true
    })
    .map((r: any) => {
      const current = latestMap[r.component] ?? 0
      const prev = prevMap[r.component]
      return {
        component: r.component,
        label: LABELS[r.component] || r.component,
        normalized_value: Number(r.normalized_value),
        smoothed_value: r.smoothed_value != null ? Number(r.smoothed_value) : null,
        delta: prev != null ? current - prev : null,
      }
    })

  // 4. Get active signals
  const today = new Date().toISOString().split('T')[0]
  const { data: signalsRaw } = await supabase
    .from('signals')
    .select('signal_type, direction, strength, reasoning, date, expires_at')
    .eq('model_id', model.id)
    .or(`expires_at.is.null,expires_at.gte.${today}`)
    .order('date', { ascending: false })
    .limit(10)

  const signals = (signalsRaw ?? []).map((s: any) => ({
    signal_type: s.signal_type,
    direction: s.direction || 'neutral',
    strength: Number(s.strength ?? 0),
    reasoning: s.reasoning || '',
    date: s.date,
    expires_at: s.expires_at,
  }))

  return {
    model: {
      slug: model.slug,
      name: model.name,
      company: model.company,
      color: model.color,
    },
    latestScore,
    history,
    breakdown,
    signals,
  }
}

// --- Page component ---

export default async function ModelPage({
  params,
}: {
  params: { slug: string }
}) {
  const data = await getModelData(params.slug)

  if (!data) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link href="/dashboard" className="hover:text-slate-300 transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-slate-300">{data.model.name}</span>
      </nav>

      <ModelDetailView
        model={data.model}
        latestScore={data.latestScore}
        history={data.history}
        breakdown={data.breakdown}
        signals={data.signals}
      />
    </div>
  )
}
