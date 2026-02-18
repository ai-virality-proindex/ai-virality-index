import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'

export const revalidate = 3600 // Cache for 1 hour

const querySchema = z.object({
  model: z.string().min(1).max(50),
  days: z.coerce.number().int().min(1).max(90).default(30),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const parsed = querySchema.safeParse({
      model: searchParams.get('model') ?? undefined,
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

    const { model, days } = parsed.data
    const supabase = createServerClient()

    // Free tier: 1-day delay, max 90 days
    const delayDate = new Date()
    delayDate.setDate(delayDate.getDate() - 1)
    const toDate = delayDate.toISOString().split('T')[0]

    const fromDate = new Date(delayDate)
    fromDate.setDate(fromDate.getDate() - days)
    const fromStr = fromDate.toISOString().split('T')[0]

    // First resolve model slug to ID
    const { data: modelData, error: modelError } = await supabase
      .from('models')
      .select('id, slug, name, company, color')
      .eq('slug', model)
      .eq('is_active', true)
      .single()

    if (modelError || !modelData) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: `Model '${model}' not found`,
          },
        },
        { status: 404 }
      )
    }

    // Fetch daily scores for the model in date range
    const { data: scores, error: scoresError } = await supabase
      .from('daily_scores')
      .select(
        'date, vi_trade, vi_content, signal_trade, heat_content, delta7_trade, delta7_content'
      )
      .eq('model_id', modelData.id)
      .gte('date', fromStr)
      .lte('date', toDate)
      .order('date', { ascending: true })

    if (scoresError) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: scoresError.message } },
        { status: 500 }
      )
    }

    const history = (scores ?? []).map((row: any) => ({
      date: row.date,
      vi_trade: Number(row.vi_trade),
      vi_content: Number(row.vi_content),
      signal_trade: row.signal_trade != null ? Number(row.signal_trade) : null,
      heat_content: row.heat_content != null ? Number(row.heat_content) : null,
      delta7_trade: row.delta7_trade != null ? Number(row.delta7_trade) : null,
      delta7_content:
        row.delta7_content != null ? Number(row.delta7_content) : null,
    }))

    return NextResponse.json(
      {
        data: history,
        meta: {
          model: modelData.slug,
          name: modelData.name,
          company: modelData.company,
          color: modelData.color,
          from: fromStr,
          to: toDate,
          days,
          count: history.length,
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
