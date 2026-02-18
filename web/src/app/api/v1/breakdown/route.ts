import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'
import { requirePro } from '@/lib/api-auth'

const querySchema = z.object({
  model: z.string().min(1).max(50),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional(),
})

export async function GET(request: NextRequest) {
  try {
    // Pro plan required
    const forbidden = requirePro(request)
    if (forbidden) return forbidden

    const { searchParams } = request.nextUrl
    const parsed = querySchema.safeParse({
      model: searchParams.get('model') ?? undefined,
      date: searchParams.get('date') ?? undefined,
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

    const { model, date } = parsed.data
    const supabase = createServerClient()

    // Resolve model
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

    // Determine target date (Pro gets real-time, no delay)
    const targetDate = date ?? new Date().toISOString().split('T')[0]

    // Fetch component scores
    const { data: components, error: compError } = await supabase
      .from('component_scores')
      .select('component, raw_value, normalized_value, smoothed_value')
      .eq('model_id', modelData.id)
      .eq('date', targetDate)
      .order('component')

    if (compError) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: compError.message } },
        { status: 500 }
      )
    }

    // Fetch daily scores for context
    const { data: dailyScore } = await supabase
      .from('daily_scores')
      .select(
        'vi_trade, vi_content, signal_trade, heat_content, component_breakdown'
      )
      .eq('model_id', modelData.id)
      .eq('date', targetDate)
      .single()

    // Build breakdown map
    const componentLabels: Record<string, string> = {
      T: 'Trends (Search Interest)',
      S: 'Social (YouTube + Discussion)',
      G: 'GitHub (Developer Adoption)',
      N: 'News (GDELT Media)',
      Q: 'Quality (Arena Elo + AA)',
      M: 'Market (Polymarket Odds)',
    }

    const breakdown = (components ?? []).map((c: any) => ({
      component: c.component,
      label: componentLabels[c.component] ?? c.component,
      raw_value: c.raw_value != null ? Number(c.raw_value) : null,
      normalized: Number(c.normalized_value),
      smoothed: c.smoothed_value != null ? Number(c.smoothed_value) : null,
    }))

    return NextResponse.json({
      data: {
        model: modelData.slug,
        name: modelData.name,
        company: modelData.company,
        color: modelData.color,
        date: targetDate,
        vi_trade: dailyScore ? Number(dailyScore.vi_trade) : null,
        vi_content: dailyScore ? Number(dailyScore.vi_content) : null,
        signal_trade: dailyScore?.signal_trade
          ? Number(dailyScore.signal_trade)
          : null,
        heat_content: dailyScore?.heat_content
          ? Number(dailyScore.heat_content)
          : null,
        components: breakdown,
      },
      meta: {
        date: targetDate,
        component_count: breakdown.length,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
