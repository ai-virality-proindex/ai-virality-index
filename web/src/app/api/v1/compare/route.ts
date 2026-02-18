import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'
import { requirePro } from '@/lib/api-auth'

const querySchema = z.object({
  models: z
    .string()
    .min(1)
    .refine(
      (val) => {
        const slugs = val.split(',').map((s) => s.trim())
        return slugs.length >= 2 && slugs.length <= 7
      },
      { message: 'Provide 2-7 comma-separated model slugs' }
    ),
  days: z.coerce.number().int().min(1).max(365).default(30),
})

export async function GET(request: NextRequest) {
  try {
    // Pro plan required
    const forbidden = requirePro(request)
    if (forbidden) return forbidden

    const { searchParams } = request.nextUrl
    const parsed = querySchema.safeParse({
      models: searchParams.get('models') ?? undefined,
      days: searchParams.get('days') ?? 30,
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

    const slugs = parsed.data.models.split(',').map((s) => s.trim())
    const days = parsed.data.days
    const supabase = createServerClient()

    // Resolve model slugs to IDs
    const { data: modelsData, error: modelsError } = await supabase
      .from('models')
      .select('id, slug, name, company, color')
      .in('slug', slugs)
      .eq('is_active', true)

    if (modelsError) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: modelsError.message } },
        { status: 500 }
      )
    }

    if (!modelsData || modelsData.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: `No valid models found for slugs: ${slugs.join(', ')}`,
          },
        },
        { status: 404 }
      )
    }

    // Date range (Pro gets real-time, no delay)
    const toDate = new Date().toISOString().split('T')[0]
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days)
    const fromStr = fromDate.toISOString().split('T')[0]

    const modelIds = modelsData.map((m: any) => m.id)

    // Fetch daily scores for all models in range
    const { data: scores, error: scoresError } = await supabase
      .from('daily_scores')
      .select(
        'model_id, date, vi_trade, vi_content, signal_trade, heat_content, delta7_trade, delta7_content'
      )
      .in('model_id', modelIds)
      .gte('date', fromStr)
      .lte('date', toDate)
      .order('date', { ascending: true })

    if (scoresError) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: scoresError.message } },
        { status: 500 }
      )
    }

    // Build lookup: model_id -> model info
    const modelLookup: Record<string, any> = {}
    for (const m of modelsData) {
      modelLookup[m.id] = { slug: m.slug, name: m.name, company: m.company, color: m.color }
    }

    // Group scores by model
    const grouped: Record<
      string,
      {
        model: string
        name: string
        company: string
        color: string
        series: any[]
      }
    > = {}

    for (const m of modelsData) {
      grouped[m.id] = {
        model: m.slug,
        name: m.name,
        company: m.company,
        color: m.color,
        series: [],
      }
    }

    for (const row of scores ?? []) {
      const mid = row.model_id as string
      if (grouped[mid]) {
        grouped[mid].series.push({
          date: row.date,
          vi_trade: Number(row.vi_trade),
          vi_content: Number(row.vi_content),
          signal_trade:
            row.signal_trade != null ? Number(row.signal_trade) : null,
          heat_content:
            row.heat_content != null ? Number(row.heat_content) : null,
          delta7_trade:
            row.delta7_trade != null ? Number(row.delta7_trade) : null,
          delta7_content:
            row.delta7_content != null ? Number(row.delta7_content) : null,
        })
      }
    }

    const comparison = Object.values(grouped)

    // Find models that weren't found
    const foundSlugs = modelsData.map((m: any) => m.slug)
    const notFound = slugs.filter((s) => !foundSlugs.includes(s))

    return NextResponse.json({
      data: comparison,
      meta: {
        models: foundSlugs,
        not_found: notFound.length > 0 ? notFound : undefined,
        from: fromStr,
        to: toDate,
        days,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
