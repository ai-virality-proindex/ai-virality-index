/**
 * Get color for index value (0-100)
 * Red (0-25) → Orange (25-50) → Yellow (50-75) → Green (75-100)
 */
export function getIndexColor(value: number): string {
  if (value <= 25) return '#EF4444' // red
  if (value <= 50) return '#F59E0B' // orange
  if (value <= 75) return '#EAB308' // yellow
  return '#10B981' // green
}

/**
 * Format delta value with + or - sign
 */
export function formatDelta(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}`
}

/**
 * Get label for index range
 */
export function getIndexLabel(value: number): string {
  if (value <= 15) return 'Extreme Low'
  if (value <= 30) return 'Low'
  if (value <= 45) return 'Below Average'
  if (value <= 55) return 'Neutral'
  if (value <= 70) return 'Above Average'
  if (value <= 85) return 'High'
  return 'Extreme High'
}
