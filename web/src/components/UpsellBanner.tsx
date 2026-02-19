'use client'

import Link from 'next/link'
import { trackConversion } from '../lib/analytics'

interface UpsellBannerProps {
  variant: 'dashboard-delay' | 'model-breakdown' | 'compare-signals'
}

const BANNER_CONFIG = {
  'dashboard-delay': {
    text: 'You\'re viewing delayed data. Upgrade for real-time updates.',
    cta: 'Get real-time',
  },
  'model-breakdown': {
    text: 'Component breakdown is available for Pro users.',
    cta: 'Unlock with Pro',
  },
  'compare-signals': {
    text: 'Full comparison with trading signals is a Pro feature.',
    cta: 'Upgrade to Pro',
  },
} as const

export default function UpsellBanner({ variant }: UpsellBannerProps) {
  const config = BANNER_CONFIG[variant]

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center justify-between gap-4">
      <span className="text-sm text-amber-200/90">{config.text}</span>
      <Link
        href="/pricing"
        onClick={() => trackConversion('upsell_clicked', { variant })}
        className="shrink-0 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
      >
        {config.cta} &rarr;
      </Link>
    </div>
  )
}
