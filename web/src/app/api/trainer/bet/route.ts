import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient } from '../../../../lib/supabase-server'
import { createServerClient } from '../../../../lib/supabase'
import { isTrainerUser } from '../../../../lib/trainer-auth'
import { calculateOdds } from '../../../../lib/odds'
import { z } from 'zod'

const placeBetSchema = z.object({
  model_slug: z.string().min(1),
  direction: z.enum(['above', 'below']),
  threshold: z.number().min(0).max(100),
  timeframe_days: z.number().refine((v) => [1, 3, 7, 14].includes(v), {
    message: 'Timeframe must be 1, 3, 7, or 14 days',
  }),
  bet_amount: z.number().min(10).max(500),
})

const INITIAL_BALANCE = 1000

// POST /api/trainer/bet — place a new bet
export async function POST(request: NextRequest) {
  const supabase = await createAuthServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  if (!isTrainerUser(user.email)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Access denied' } },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  const parsed = placeBetSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
      { status: 400 }
    )
  }

  const { model_slug, direction, threshold, timeframe_days, bet_amount } = parsed.data
  const admin = createServerClient()

  // Look up model
  const { data: model } = await admin
    .from('models')
    .select('id')
    .eq('slug', model_slug)
    .eq('is_active', true)
    .single()

  if (!model) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Model not found: ${model_slug}` } },
      { status: 404 }
    )
  }

  // Fetch current vi_trade (latest daily_scores)
  const { data: latestScore } = await admin
    .from('daily_scores')
    .select('vi_trade, date')
    .eq('model_id', model.id)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (!latestScore) {
    return NextResponse.json(
      { error: { code: 'NO_DATA', message: 'No index data available for this model' } },
      { status: 400 }
    )
  }

  const currentIndex = Number(latestScore.vi_trade)

  // Fetch 90-day history for volatility calculation
  const { data: historyRows } = await admin
    .from('daily_scores')
    .select('vi_trade')
    .eq('model_id', model.id)
    .order('date', { ascending: true })
    .limit(90)

  const historicalScores = (historyRows ?? []).map((r: any) => Number(r.vi_trade))

  // Calculate odds
  const oddsResult = calculateOdds(
    currentIndex,
    threshold,
    direction,
    timeframe_days,
    historicalScores
  )

  // Check balance
  const { data: existingBets } = await admin
    .from('sim_bets')
    .select('bet_amount, payout')
    .eq('user_id', user.id)

  let totalBetAmount = 0
  let totalPayout = 0
  for (const b of existingBets ?? []) {
    totalBetAmount += Number(b.bet_amount)
    totalPayout += Number(b.payout)
  }
  const currentBalance = INITIAL_BALANCE - totalBetAmount + totalPayout

  if (bet_amount > currentBalance) {
    return NextResponse.json(
      { error: { code: 'INSUFFICIENT_BALANCE', message: `Insufficient balance. Available: $${currentBalance.toFixed(2)}` } },
      { status: 400 }
    )
  }

  // Calculate expiry date
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + timeframe_days)
  const expiresAtStr = expiresAt.toISOString().split('T')[0] // YYYY-MM-DD

  const potentialPayout = Math.round(bet_amount * oddsResult.odds * 100) / 100

  // Insert bet
  const { data: newBet, error } = await admin
    .from('sim_bets')
    .insert({
      user_id: user.id,
      model_id: model.id,
      direction,
      threshold,
      timeframe_days,
      bet_amount,
      odds: oddsResult.odds,
      implied_probability: oddsResult.impliedProbability,
      potential_payout: potentialPayout,
      index_at_bet: currentIndex,
      volatility_at_bet: oddsResult.volatility,
      status: 'active',
      payout: 0,
      expires_at: expiresAtStr,
    })
    .select('id, direction, threshold, timeframe_days, bet_amount, odds, potential_payout, index_at_bet, status, placed_at, expires_at')
    .single()

  if (error) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    )
  }

  return NextResponse.json({
    data: {
      bet: { ...newBet, model_slug },
      balance_after: Math.round((currentBalance - bet_amount) * 100) / 100,
    },
  }, { status: 201 })
}
