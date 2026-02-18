/**
 * Polymarket Trainer — Odds Calculator
 *
 * Calculates betting odds for AVI index predictions using a simplified
 * random-walk model based on historical volatility and normal distribution.
 */

/** Approximate normal CDF using the error function (no scipy needed). */
function normCdf(x: number): number {
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const sign = x < 0 ? -1 : 1
  const absX = Math.abs(x)
  const t = 1.0 / (1.0 + p * absX)
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX)

  return 0.5 * (1.0 + sign * y)
}

export type OddsResult = {
  odds: number // payout multiplier (e.g. 2.5x)
  impliedProbability: number // 0-1 probability estimate
  volatility: number // historical vol scaled to timeframe
}

/**
 * Calculate odds for a prediction bet.
 *
 * @param currentIndex - Current VI_trade value (0-100)
 * @param threshold    - Target threshold (e.g. 70)
 * @param direction    - 'above' or 'below'
 * @param timeframeDays - 1, 3, 7, or 14
 * @param historicalScores - Last 90 days of VI_trade scores for this model
 */
export function calculateOdds(
  currentIndex: number,
  threshold: number,
  direction: 'above' | 'below',
  timeframeDays: number,
  historicalScores: number[],
): OddsResult {
  // Step 1: Calculate historical daily volatility
  let dailyVol = 3.0 // fallback if not enough data

  if (historicalScores.length >= 7) {
    const changes = historicalScores
      .slice(1)
      .map((v, i) => v - historicalScores[i])
    const mean = changes.reduce((a, b) => a + b, 0) / changes.length
    const variance =
      changes.reduce((a, b) => a + (b - mean) ** 2, 0) / changes.length
    dailyVol = Math.sqrt(variance)
  }

  // Step 2: Scale volatility to timeframe (sqrt-time rule)
  let timeframeVol = dailyVol * Math.sqrt(timeframeDays)
  if (timeframeVol < 0.5) timeframeVol = 0.5 // floor to prevent extreme odds

  // Step 3: Calculate distance in vol units
  const distance =
    direction === 'above'
      ? threshold - currentIndex // positive = needs to go up
      : currentIndex - threshold // positive = needs to go down

  const zDistance = distance / timeframeVol

  // Step 4: Probability via normal CDF
  let probability = 1.0 - normCdf(zDistance)

  // Step 5: Apply bounds (5%-95%)
  probability = Math.max(0.05, Math.min(0.95, probability))

  // Step 6: Add 5% vigorish (house edge)
  let adjustedProbability = Math.min(0.95, probability * 1.05)

  // Step 7: Calculate odds
  let odds = 1.0 / adjustedProbability
  odds = Math.round(Math.max(1.05, Math.min(20.0, odds)) * 100) / 100

  return {
    odds,
    impliedProbability: Math.round(adjustedProbability * 10000) / 10000,
    volatility: Math.round(timeframeVol * 100) / 100,
  }
}
