import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'

export const revalidate = 3600 // Cache for 1 hour

const querySchema = z.object({
  model: z.string().min(1).max(50).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const parsed = querySchema.safeParse({
      model: searchParams.get('model') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => i.message).join('; '),
          },
        },
        { status: 400 }
      )
    }

    const { model } = parsed.data
    const supabase = createServerClient()

    // Free tier: 1-day delay. Get yesterday's date.
    const delayDate = new Date()
    delayDate.setDate(delayDate.getDate() - 1)
    const dateStr = delayDate.toISOString().split('T')[0]

    // Build query: join daily_scores with models
    let query = supabase
      .from('daily_scores')
      .select(
        `
        date,
        vi_trade,
        vi_content,
        signal_trade,
        heat_content,
        delta7_trade,
        delta7_content,
        component_breakdown,
        models!inner (slug, name, company, color)
      `
      )
      .lte('date', dateStr)
      .order('date', { ascending: false })

    if (model) {
      query = query.eq('models.slug', model)
    }

    // Get latest date's scores: fetch top N rows, then dedupe by model
    const { data: rawData, error } = await query.limit(model ? 1 : 50)

    if (error) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 }
      )
    }

    if (!rawData || rawData.length === 0) {
      return NextResponse.json(
        {
          data: [],
          meta: { count: 0, date: dateStr },
        },
        {
          headers: {
            'Cache-Control':
              'public, s-maxage=3600, stale-while-revalidate=600',
          },
        }
      )
    }

    // Deduplicate: keep only the latest row per model slug
    const seen = new Set<string>()
    const scores = rawData
      .filter((row: any) => {
        const slug = row.models?.slug
        if (!slug || seen.has(slug)) return false
        seen.add(slug)
        return true
      })
      .map((row: any) => ({
        model: row.models?.slug,
        name: row.models?.name,
        company: row.models?.company,
        color: row.models?.color,
        date: row.date,
        vi_trade: Number(row.vi_trade),
        vi_content: Number(row.vi_content),
        signal_trade: row.signal_trade != null ? Number(row.signal_trade) : null,
        heat_content: row.heat_content != null ? Number(row.heat_content) : null,
        delta7_trade: row.delta7_trade != null ? Number(row.delta7_trade) : null,
        delta7_content:
          row.delta7_content != null ? Number(row.delta7_content) : null,
        component_breakdown: row.component_breakdown,
      }))

    const latestDate = scores[0]?.date ?? dateStr

    return NextResponse.json(
      {
        data: model ? scores[0] ?? null : scores,
        meta: {
          count: scores.length,
          date: latestDate,
          delayed: true,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
        },
      }
    )
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
