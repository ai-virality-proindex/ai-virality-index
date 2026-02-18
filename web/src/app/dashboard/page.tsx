import { createServerClient } from '@/lib/supabase'
import DashboardView from '@/components/DashboardView'
import type { ModelScore } from '@/components/ModelCard'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard — AI Virality Index',
  description: 'Real-time virality scores for ChatGPT, Gemini, Claude, DeepSeek, Grok, Perplexity, and Copilot.',
}

export const revalidate = 3600 // ISR: revalidate every hour

interface DBScore {
  date: string
  vi_trade: number
  vi_content: number
  signal_trade: number | null
  heat_content: number | null
  delta7_trade: number | null
  delta7_content: number | null
  component_breakdown: Record<string, number> | null
  models: {
    slug: string
    name: string
    company: string
    color: string
  }
}

async function getDashboardData(): Promise<{
  scores: ModelScore[]
  historyMap: Record<string, number[]>
  historyContentMap: Record<string, number[]>
  lastDate: string | null
  lastFetchedAt: string | null
}> {
  try {
    const supabase = createServerClient()

    // 1. Fetch latest scores (all models)
    const { data: latestRaw, error: latestErr } = await supabase
      .from('daily_scores')
      .select(`
        date, vi_trade, vi_content, signal_trade, heat_content,
        delta7_trade, delta7_content, component_breakdown,
        models!inner(slug, name, company, color)
      `)
      .order('date', { ascending: false })
      .limit(50) // 7 models × several days

    if (latestErr || !latestRaw) {
      console.error('Dashboard: error fetching latest scores', latestErr)
      return { scores: [], historyMap: {}, historyContentMap: {}, lastDate: null, lastFetchedAt: null }
    }

    // Deduplicate — keep latest per model
    const seen = new Set<string>()
    const scores: ModelScore[] = []
    for (const row of latestRaw as unknown as DBScore[]) {
      const slug = row.models?.slug
      if (!slug || seen.has(slug)) continue
      seen.add(slug)
      scores.push({
        model: slug,
        name: row.models.name,
        company: row.models.company,
        color: row.models.color,
        date: row.date,
        vi_trade: Number(row.vi_trade),
        vi_content: Number(row.vi_content),
        signal_trade: row.signal_trade != null ? Number(row.signal_trade) : null,
        heat_content: row.heat_content != null ? Number(row.heat_content) : null,
        delta7_trade: row.delta7_trade != null ? Number(row.delta7_trade) : null,
        delta7_content: row.delta7_content != null ? Number(row.delta7_content) : null,
        component_breakdown: row.component_breakdown,
      })
    }

    const lastDate = scores.length > 0 ? scores[0].date : null

    // 1b. Fetch latest fetched_at timestamp from raw_metrics
    let lastFetchedAt: string | null = null
    if (lastDate) {
      const { data: fetchedRow } = await supabase
        .from('raw_metrics')
        .select('fetched_at')
        .eq('date', lastDate)
        .order('fetched_at', { ascending: false })
        .limit(1)
      lastFetchedAt = fetchedRow?.[0]?.fetched_at ?? null
    }

    // 2. Fetch 30-day history for sparklines
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 31)
    const fromStr = thirtyDaysAgo.toISOString().split('T')[0]

    const { data: historyRaw } = await supabase
      .from('daily_scores')
      .select('date, vi_trade, vi_content, models!inner(slug)')
      .gte('date', fromStr)
      .order('date', { ascending: true })
      .limit(300) // 7 models × ~30 days

    const historyMap: Record<string, number[]> = {}
    const historyContentMap: Record<string, number[]> = {}

    if (historyRaw) {
      for (const row of historyRaw as any[]) {
        const slug = row.models?.slug
        if (!slug) continue
        if (!historyMap[slug]) historyMap[slug] = []
        if (!historyContentMap[slug]) historyContentMap[slug] = []
        historyMap[slug].push(Number(row.vi_trade))
        historyContentMap[slug].push(Number(row.vi_content))
      }
    }

    return { scores, historyMap, historyContentMap, lastDate, lastFetchedAt }
  } catch (err) {
    console.error('Dashboard: unexpected error', err)
    return { scores: [], historyMap: {}, historyContentMap: {}, lastDate: null, lastFetchedAt: null }
  }
}

export default async function DashboardPage() {
  const { scores, historyMap, historyContentMap, lastDate, lastFetchedAt } = await getDashboardData()

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
      <DashboardView
        scores={scores}
        historyMap={historyMap}
        historyContentMap={historyContentMap}
        lastDate={lastDate}
        lastFetchedAt={lastFetchedAt}
      />
    </div>
  )
}
