import { createServerClient } from '@/lib/supabase'
import CompareView from '@/components/CompareView'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Compare Models — AI Virality Index',
  description: 'Compare virality scores of AI models side by side. ChatGPT vs Gemini vs Claude and more.',
}

export const revalidate = 3600

interface HistoryPoint {
  date: string
  vi_trade: number
  vi_content: number
}

async function getCompareData() {
  try {
    const supabase = createServerClient()

    // 1. Get all active models
    const { data: modelsRaw } = await supabase
      .from('models')
      .select('id, slug, name, company, color')
      .eq('is_active', true)
      .order('name')

    const models = (modelsRaw ?? []).map((m: any) => ({
      slug: m.slug,
      name: m.name,
      company: m.company,
      color: m.color,
    }))

    // 2. Fetch 90-day history for all models
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 91)
    const fromStr = ninetyDaysAgo.toISOString().split('T')[0]

    const { data: historyRaw } = await supabase
      .from('daily_scores')
      .select('date, vi_trade, vi_content, delta7_trade, delta7_content, models!inner(slug)')
      .gte('date', fromStr)
      .order('date', { ascending: true })
      .limit(700) // 7 models × ~90 days

    const historyMap: Record<string, HistoryPoint[]> = {}
    const latestMap: Record<string, {
      vi_trade: number
      vi_content: number
      delta7_trade: number | null
      delta7_content: number | null
    }> = {}

    if (historyRaw) {
      for (const row of historyRaw as any[]) {
        const slug = row.models?.slug
        if (!slug) continue

        if (!historyMap[slug]) historyMap[slug] = []
        historyMap[slug].push({
          date: row.date,
          vi_trade: Number(row.vi_trade),
          vi_content: Number(row.vi_content),
        })

        // Track latest per model
        latestMap[slug] = {
          vi_trade: Number(row.vi_trade),
          vi_content: Number(row.vi_content),
          delta7_trade: row.delta7_trade != null ? Number(row.delta7_trade) : null,
          delta7_content: row.delta7_content != null ? Number(row.delta7_content) : null,
        }
      }
    }

    return { models, historyMap, latestMap }
  } catch (err) {
    console.error('Compare: error fetching data', err)
    return { models: [], historyMap: {}, latestMap: {} }
  }
}

export default async function ComparePage() {
  const { models, historyMap, latestMap } = await getCompareData()

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <CompareView
        models={models}
        historyMap={historyMap}
        latestMap={latestMap}
      />
    </div>
  )
}
