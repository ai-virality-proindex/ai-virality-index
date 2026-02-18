import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'
import { requirePro } from '@/lib/api-auth'

const querySchema = z.object({
  model: z.string().min(1).max(50).optional(),
  active: z.enum(['true', 'false']).default('true'),
})

export async function GET(request: NextRequest) {
  try {
    // Pro plan required
    const forbidden = requirePro(request)
    if (forbidden) return forbidden

    const { searchParams } = request.nextUrl
    const parsed = querySchema.safeParse({
      model: searchParams.get('model') ?? undefined,
      active: searchParams.get('active') ?? 'true',
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

    const { model, active } = parsed.data
    const supabase = createServerClient()
    const today = new Date().toISOString().split('T')[0]

    // Build query
    let query = supabase
      .from('signals')
      .select(
        `
        date,
        signal_type,
        direction,
        strength,
        vi_trade,
        polymarket_odds,
        divergence_score,
        reasoning,
        expires_at,
        models!inner (slug, name, color)
      `
      )
      .order('date', { ascending: false })
      .order('strength', { ascending: false })

    // Filter by model if specified
    if (model) {
      query = query.eq('models.slug', model)
    }

    // Filter active signals (not expired)
    if (active === 'true') {
      query = query.or(`expires_at.is.null,expires_at.gte.${today}`)
    }

    // Limit to recent signals (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    query = query.gte('date', thirtyDaysAgo.toISOString().split('T')[0])

    const { data: signals, error } = await query.limit(100)

    if (error) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 }
      )
    }

    const formatted = (signals ?? []).map((s: any) => ({
      model: s.models?.slug,
      name: s.models?.name,
      color: s.models?.color,
      date: s.date,
      signal_type: s.signal_type,
      direction: s.direction,
      strength: s.strength != null ? Number(s.strength) : null,
      vi_trade: s.vi_trade != null ? Number(s.vi_trade) : null,
      polymarket_odds:
        s.polymarket_odds != null ? Number(s.polymarket_odds) : null,
      divergence_score:
        s.divergence_score != null ? Number(s.divergence_score) : null,
      reasoning: s.reasoning,
      expires_at: s.expires_at,
    }))

    return NextResponse.json({
      data: formatted,
      meta: {
        count: formatted.length,
        active_only: active === 'true',
        model: model ?? 'all',
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
