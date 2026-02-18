import { NextResponse } from 'next/server'
import { createAuthServerClient } from '../../../../lib/supabase-server'
import { createServerClient } from '../../../../lib/supabase'
import { isTrainerUser } from '../../../../lib/trainer-auth'

// GET /api/trainer/bets — list all bets + balance + stats
export async function GET() {
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

  const admin = createServerClient()

  const { data: bets, error } = await admin
    .from('sim_bets')
    .select('*, models(slug, name, color)')
    .eq('user_id', user.id)
    .order('placed_at', { ascending: false })

  if (error) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    )
  }

  // Calculate balance and stats
  const INITIAL_BALANCE = 1000
  let totalBetAmount = 0
  let totalPayout = 0
  let wins = 0
  let losses = 0
  let activeCount = 0

  for (const bet of bets) {
    totalBetAmount += Number(bet.bet_amount)
    totalPayout += Number(bet.payout)
    if (bet.status === 'won') wins++
    else if (bet.status === 'lost') losses++
    else if (bet.status === 'active') activeCount++
  }

  const balance = INITIAL_BALANCE - totalBetAmount + totalPayout
  const resolvedCount = wins + losses
  const totalPnl = totalPayout - totalBetAmount
  const roiPct = totalBetAmount > 0 ? (totalPnl / totalBetAmount) * 100 : 0
  const winRate = resolvedCount > 0 ? (wins / resolvedCount) * 100 : 0

  return NextResponse.json({
    data: {
      bets: bets.map((b: any) => ({
        id: b.id,
        model_slug: b.models?.slug,
        model_name: b.models?.name,
        model_color: b.models?.color,
        direction: b.direction,
        threshold: Number(b.threshold),
        timeframe_days: b.timeframe_days,
        bet_amount: Number(b.bet_amount),
        odds: Number(b.odds),
        implied_probability: Number(b.implied_probability),
        potential_payout: Number(b.potential_payout),
        index_at_bet: Number(b.index_at_bet),
        status: b.status,
        index_at_resolution: b.index_at_resolution ? Number(b.index_at_resolution) : null,
        payout: Number(b.payout),
        placed_at: b.placed_at,
        expires_at: b.expires_at,
        resolved_at: b.resolved_at,
      })),
      balance: Math.round(balance * 100) / 100,
      stats: {
        total_bets: bets.length,
        active: activeCount,
        wins,
        losses,
        win_rate: Math.round(winRate * 10) / 10,
        total_pnl: Math.round(totalPnl * 100) / 100,
        roi_pct: Math.round(roiPct * 10) / 10,
      },
    },
    meta: { count: bets.length },
  })
}
