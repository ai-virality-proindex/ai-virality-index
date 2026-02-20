import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const revalidate = 3600 // ISR: 1 hour

const COMPONENT_LABELS: Record<string, string> = {
  T: 'Search Interest (Google Trends)',
  S: 'Social (YouTube + Hacker News)',
  G: 'GitHub (Stars, Forks, Issues)',
  N: 'News (GDELT Media Coverage)',
  D: 'Dev Adoption (npm + PyPI Downloads)',
  M: 'Mindshare (Wikipedia Pageviews)',
}

const COMPONENT_ORDER = ['T', 'S', 'G', 'N', 'D', 'M']

export async function GET() {
  try {
    const supabase = createServerClient()
    const today = new Date().toISOString().split('T')[0]

    // Fetch models
    const { data: models } = await supabase
      .from('models')
      .select('id, slug, name, company')
      .eq('is_active', true)
      .order('slug')

    if (!models || models.length === 0) {
      return new NextResponse('# AI Virality Index\n\nNo data available.', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    // Fetch latest daily_scores (today or most recent)
    const { data: scores } = await supabase
      .from('daily_scores')
      .select('model_id, date, vi_trade, vi_content, delta7_trade, delta7_content, models!inner(slug, name)')
      .lte('date', today)
      .order('date', { ascending: false })
      .limit(50)

    // Deduplicate: keep latest per model
    const scoreMap = new Map<string, any>()
    for (const row of scores ?? []) {
      const slug = (row as any).models?.slug
      if (slug && !scoreMap.has(slug)) {
        scoreMap.set(slug, row)
      }
    }

    const latestDate = scores?.[0]?.date ?? today

    // Fetch component_scores for that date
    const { data: components } = await supabase
      .from('component_scores')
      .select('model_id, component, normalized_value, models!inner(slug)')
      .eq('date', latestDate)

    // Build component map: slug -> { T: val, S: val, ... }
    const compMap = new Map<string, Record<string, number>>()
    for (const c of components ?? []) {
      const slug = (c as any).models?.slug
      if (!slug) continue
      if (!compMap.has(slug)) compMap.set(slug, {})
      const comp = c.component === 'Q' ? 'D' : c.component
      compMap.get(slug)![comp] = Number(c.normalized_value)
    }

    // Build Markdown
    const lines: string[] = []

    lines.push('# AI Virality Index — Full Data')
    lines.push('')
    lines.push('> Real-time virality index (0–100) for the world\'s leading AI models, updated daily.')
    lines.push('')
    lines.push(`Data as of: ${latestDate}`)
    lines.push('')

    // --- Methodology ---
    lines.push('## Methodology')
    lines.push('')
    lines.push('The index aggregates 6 signal components into a weighted composite score (0–100).')
    lines.push('')
    lines.push('**Trading Mode**: `VI = 0.18×T + 0.28×S + 0.15×G + 0.12×N + 0.15×D + 0.12×M`')
    lines.push('**Content Mode**: `VI = 0.25×T + 0.35×S + 0.05×G + 0.20×N + 0.05×D + 0.10×M`')
    lines.push('')

    // --- Components ---
    lines.push('## Components')
    lines.push('')
    for (const code of COMPONENT_ORDER) {
      lines.push(`- **${code}**: ${COMPONENT_LABELS[code]}`)
    }
    lines.push('')

    // --- Current Scores Table ---
    lines.push('## Current Scores')
    lines.push('')
    lines.push('| Model | Company | Trading | Content | 7d Delta (T) | 7d Delta (C) |')
    lines.push('|-------|---------|---------|---------|--------------|--------------|')

    for (const model of models) {
      const s = scoreMap.get(model.slug)
      if (!s) {
        lines.push(`| ${model.name} | ${model.company} | — | — | — | — |`)
        continue
      }
      const vt = Number(s.vi_trade).toFixed(1)
      const vc = Number(s.vi_content).toFixed(1)
      const d7t = s.delta7_trade != null ? (Number(s.delta7_trade) >= 0 ? '+' : '') + Number(s.delta7_trade).toFixed(1) : '—'
      const d7c = s.delta7_content != null ? (Number(s.delta7_content) >= 0 ? '+' : '') + Number(s.delta7_content).toFixed(1) : '—'
      lines.push(`| ${model.name} | ${model.company} | ${vt} | ${vc} | ${d7t} | ${d7c} |`)
    }
    lines.push('')

    // --- Component Breakdown ---
    lines.push('## Component Breakdown')
    lines.push('')
    lines.push(`| Model | ${COMPONENT_ORDER.map(c => c).join(' | ')} |`)
    lines.push(`|-------|${COMPONENT_ORDER.map(() => '---').join('|')}|`)

    for (const model of models) {
      const comps = compMap.get(model.slug) ?? {}
      const vals = COMPONENT_ORDER.map(c => {
        const v = comps[c]
        return v != null ? Number(v).toFixed(1) : '—'
      })
      lines.push(`| ${model.name} | ${vals.join(' | ')} |`)
    }
    lines.push('')

    // --- Links ---
    lines.push('## Links')
    lines.push('')
    lines.push('- Website: https://ai-virality-index.vercel.app')
    lines.push('- Dashboard: https://ai-virality-index.vercel.app/dashboard')
    lines.push('- API (free): https://ai-virality-index.vercel.app/api/v1/index/latest')
    lines.push('- Blog: https://ai-virality-index.vercel.app/blog')
    lines.push('- Methodology: https://ai-virality-index.vercel.app/blog/what-is-ai-virality-index')
    lines.push('')

    const markdown = lines.join('\n')

    return new NextResponse(markdown, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
      },
    })
  } catch {
    return new NextResponse('# AI Virality Index\n\nTemporarily unavailable.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}
