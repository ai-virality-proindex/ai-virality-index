'use client'

import { useState, useEffect } from 'react'
import { createAuthBrowserClient } from '../../lib/supabase'

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Explore the AI Virality Index',
    features: [
      'Current index (1-3 day delay)',
      '90-day chart history',
      'All 7 AI models',
      'Basic API (60 req/min)',
      'Dashboard access',
    ],
    cta: 'Get started',
    ctaAction: 'free',
    highlight: false,
  },
  {
    name: 'Pro Trader',
    price: '$29',
    period: '/month',
    description: 'For Polymarket & prediction market traders',
    features: [
      'Real-time data (no delay)',
      'Full historical data',
      'Component breakdown (T/S/G/N/Q/M)',
      'Trading signals & divergence alerts',
      'API: 600 req/min',
      'Priority email support',
    ],
    cta: 'Start trading',
    ctaAction: 'pro_trader',
    highlight: true,
    badge: 'Most Popular',
  },
  {
    name: 'Pro Builder',
    price: '$99',
    period: '/month',
    description: 'For developers, content creators & teams',
    features: [
      'Everything in Pro Trader',
      'API: 3,000 req/min',
      'Webhook alerts',
      'CSV data export',
      'Priority support',
      'Custom integrations',
    ],
    cta: 'Start building',
    ctaAction: 'pro_builder',
    highlight: false,
  },
]

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)

  useEffect(() => {
    const supabase = createAuthBrowserClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUser({ id: user.id, email: user.email ?? undefined })
    })
  }, [])

  async function handleCheckout(planKey: string) {
    if (planKey === 'free') {
      window.location.href = user ? '/dashboard' : '/login'
      return
    }

    if (!user) {
      window.location.href = '/login'
      return
    }

    setLoading(planKey)

    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: planKey }),
    })

    const json = await res.json()
    if (json.data?.url) {
      window.location.href = json.data.url
    } else {
      setLoading(null)
      alert(json.error?.message || 'Something went wrong')
    }
  }

  async function handleManageSubscription() {
    setLoading('manage')
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    const json = await res.json()
    if (json.data?.url) {
      window.location.href = json.data.url
    } else {
      setLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">
          Choose your plan
        </h1>
        <p className="mt-3 text-lg text-slate-400">
          Start free. Upgrade when you need real-time data and trading signals.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative rounded-2xl border p-8 ${
              plan.highlight
                ? 'border-emerald-500 bg-emerald-500/5 shadow-lg shadow-emerald-500/10'
                : 'border-avi-border bg-avi-card'
            }`}
          >
            {plan.badge && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-emerald-600 px-4 py-1 text-xs font-semibold text-white">
                  {plan.badge}
                </span>
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-xl font-bold text-white">{plan.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{plan.description}</p>
            </div>

            <div className="mb-6">
              <span className="text-4xl font-bold text-white">{plan.price}</span>
              <span className="text-slate-400">{plan.period}</span>
            </div>

            <ul className="mb-8 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-slate-300">
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleCheckout(plan.ctaAction)}
              disabled={loading !== null}
              className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
                plan.highlight
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'border border-avi-border bg-avi-dark text-white hover:border-slate-500'
              }`}
            >
              {loading === plan.ctaAction ? 'Redirecting...' : plan.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Manage subscription link for existing subscribers */}
      {user && (
        <div className="mt-12 text-center">
          <button
            onClick={handleManageSubscription}
            disabled={loading === 'manage'}
            className="text-sm text-slate-400 underline hover:text-white transition-colors"
          >
            {loading === 'manage' ? 'Opening portal...' : 'Manage existing subscription'}
          </button>
        </div>
      )}

      {/* FAQ */}
      <div className="mt-20 mx-auto max-w-2xl">
        <h2 className="text-2xl font-bold text-white text-center mb-8">FAQ</h2>
        <div className="space-y-6">
          {[
            {
              q: 'What payment methods do you accept?',
              a: 'We accept all major credit cards via Stripe. No crypto payments at this time.',
            },
            {
              q: 'Can I cancel anytime?',
              a: 'Yes. Cancel at any time from the customer portal. Your access continues until the end of the billing period.',
            },
            {
              q: 'What\'s the difference between Trading and Content modes?',
              a: 'Both modes are included in every plan. Trading mode weights market conviction higher, while Content mode emphasizes social virality.',
            },
            {
              q: 'Do I need an API key for the dashboard?',
              a: 'No. The dashboard is available to all registered users. API keys are only needed for programmatic access.',
            },
          ].map(({ q, a }) => (
            <div key={q} className="rounded-xl border border-avi-border bg-avi-card p-6">
              <h3 className="text-sm font-semibold text-white">{q}</h3>
              <p className="mt-2 text-sm text-slate-400">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
