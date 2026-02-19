'use client'

import { useState } from 'react'
import Link from 'next/link'
import { trackConversion } from '@/lib/analytics'

export default function ReportPage() {
  const [loading, setLoading] = useState(false)

  async function handlePurchase() {
    setLoading(true)
    trackConversion('checkout_started', { plan: 'weekly_report' })

    try {
      const res = await fetch('/api/stripe/report-checkout', {
        method: 'POST',
      })
      const json = await res.json()

      if (json.data?.url) {
        window.location.href = json.data.url
      } else {
        setLoading(false)
        alert(json.error?.message || 'Something went wrong')
      }
    } catch {
      setLoading(false)
      alert('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <div className="text-center mb-12">
        <div className="inline-block rounded-full bg-emerald-900/30 px-4 py-1.5 text-sm font-medium text-emerald-400 mb-6">
          New: Weekly Report
        </div>
        <h1 className="text-3xl font-bold text-white sm:text-4xl mb-4">
          AI Virality Weekly Report
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          A comprehensive PDF report with scores, top movers, component breakdown, and market insights. Delivered as a downloadable PDF.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-8 items-start">
        {/* Report preview */}
        <div className="rounded-2xl border border-avi-border bg-avi-card p-8">
          <h3 className="text-lg font-bold text-white mb-4">What&apos;s Inside</h3>
          <ul className="space-y-3">
            {[
              'Market overview with average score',
              'All 7 models: Trading + Content scores',
              '7-day delta for every model',
              'Top mover of the week',
              'Component breakdown (T/S/G/N/D/M)',
              'Key takeaways and market signals',
              'What to watch next week',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-slate-300">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-6 pt-6 border-t border-avi-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Format</span>
              <span className="text-white font-medium">PDF (2 pages)</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-slate-400">Updated</span>
              <span className="text-white font-medium">Weekly (Monday)</span>
            </div>
          </div>
        </div>

        {/* Purchase card */}
        <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-500/5 p-8 shadow-lg shadow-emerald-500/10">
          <div className="text-center mb-6">
            <p className="text-5xl font-bold text-white mb-1">$7</p>
            <p className="text-slate-400">One-time purchase</p>
          </div>

          <button
            onClick={handlePurchase}
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 mb-4"
          >
            {loading ? 'Redirecting to checkout...' : 'Get This Week\u2019s Report'}
          </button>

          <div className="space-y-2 text-xs text-slate-500 text-center">
            <p>Secure payment via Stripe</p>
            <p>Instant PDF download after payment</p>
          </div>

          <div className="mt-6 pt-6 border-t border-avi-border/50 text-center">
            <p className="text-sm text-slate-400 mb-3">Want real-time data instead?</p>
            <Link
              href="/pricing"
              className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
            >
              See Pro plans &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
