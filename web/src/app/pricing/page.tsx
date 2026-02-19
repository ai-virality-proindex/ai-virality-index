'use client'

import { useState, useEffect } from 'react'
import { createAuthBrowserClient } from '../../lib/supabase'
import { trackConversion } from '../../lib/analytics'
import ContactForm from '../../components/ContactForm'
import NewsletterSignup from '../../components/NewsletterSignup'

interface PlanConfig {
  name: string
  description: string
  price: { monthly: string; annual: string }
  period: { monthly: string; annual: string }
  savings: string | null
  trial: string | null
  features: string[]
  ctaAction: { monthly: string; annual: string }
  cta: string
  highlight: boolean
  badge: string | null
}

const planConfigs: PlanConfig[] = [
  {
    name: 'Free',
    description: 'Explore the AI Virality Index',
    price: { monthly: '$0', annual: '$0' },
    period: { monthly: 'forever', annual: 'forever' },
    savings: null,
    trial: null,
    features: [
      'Current index (1-3 day delay)',
      '90-day chart history',
      'All 7 AI models',
      'Basic API (60 req/min)',
      'Dashboard access',
    ],
    ctaAction: { monthly: 'free', annual: 'free' },
    cta: 'Get started free',
    highlight: false,
    badge: null,
  },
  {
    name: 'Pro Trader',
    description: 'For prediction market & crypto traders',
    price: { monthly: '$29', annual: '$249' },
    period: { monthly: '/month', annual: '/year' },
    savings: 'Save 28%',
    trial: '7-day free trial',
    features: [
      'Real-time data (no delay)',
      'Full historical data',
      'Component breakdown (T/S/G/N/D/M)',
      'Trading signals & divergence alerts',
      'API: 600 req/min',
      'Priority email support',
    ],
    ctaAction: { monthly: 'pro_trader_monthly', annual: 'pro_trader_annual' },
    cta: 'Start your free trial',
    highlight: true,
    badge: 'Most Popular',
  },
  {
    name: 'Pro Builder',
    description: 'For developers, content creators & teams',
    price: { monthly: '$99', annual: '$899' },
    period: { monthly: '/month', annual: '/year' },
    savings: 'Save 25%',
    trial: null,
    features: [
      'Everything in Pro Trader',
      'API: 3,000 req/min',
      'Webhook alerts',
      'CSV data export',
      'Priority support',
      'Custom integrations',
    ],
    ctaAction: { monthly: 'pro_builder_monthly', annual: 'pro_builder_annual' },
    cta: 'Start building smarter',
    highlight: false,
    badge: null,
  },
]

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')

  useEffect(() => {
    trackConversion('pricing_viewed')
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
    trackConversion('checkout_started', { plan: planKey })

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
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">
          For teams that can&apos;t afford to guess
        </h1>
        <p className="mt-3 text-lg text-slate-400">
          Real-time AI virality intelligence. Start free, upgrade when you&apos;re ready.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 mb-12">
        <span className={`text-sm font-medium ${billing === 'monthly' ? 'text-white' : 'text-slate-500'}`}>
          Monthly
        </span>
        <button
          onClick={() => setBilling(billing === 'monthly' ? 'annual' : 'monthly')}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            billing === 'annual' ? 'bg-emerald-600' : 'bg-slate-600'
          }`}
        >
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
            billing === 'annual' ? 'translate-x-7' : 'translate-x-1'
          }`} />
        </button>
        <span className={`text-sm font-medium ${billing === 'annual' ? 'text-white' : 'text-slate-500'}`}>
          Annual
        </span>
        {billing === 'annual' && (
          <span className="text-xs bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
            Save up to 28%
          </span>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {planConfigs.map((plan) => {
          const ctaAction = plan.ctaAction[billing]
          return (
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

              <div className="mb-2">
                <span className="text-4xl font-bold text-white">{plan.price[billing]}</span>
                <span className="text-slate-400">{plan.period[billing]}</span>
              </div>

              {billing === 'annual' && plan.savings ? (
                <p className="text-xs text-emerald-400 font-medium mb-4">{plan.savings}</p>
              ) : plan.trial ? (
                <p className="text-xs text-amber-400 font-medium mb-4">{plan.trial}</p>
              ) : (
                <div className="mb-4" />
              )}

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
                onClick={() => handleCheckout(ctaAction)}
                disabled={loading !== null}
                className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
                  plan.highlight
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'border border-avi-border bg-avi-dark text-white hover:border-slate-500'
                }`}
              >
                {loading === ctaAction ? 'Redirecting...' : plan.cta}
              </button>
            </div>
          )
        })}
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
              q: 'Is there a free trial?',
              a: 'Yes! Pro Trader includes a 7-day free trial. No charge until the trial ends.',
            },
            {
              q: 'What\'s the difference between Trading and Content modes?',
              a: 'Both modes are included in every plan. Trading mode weights social and dev adoption higher, while Content mode emphasizes social virality.',
            },
            {
              q: 'Do I need an API key for the dashboard?',
              a: 'No. The dashboard is available to all users. API keys are only needed for programmatic access.',
            },
          ].map(({ q, a }) => (
            <div key={q} className="rounded-xl border border-avi-border bg-avi-card p-6">
              <h3 className="text-sm font-semibold text-white">{q}</h3>
              <p className="mt-2 text-sm text-slate-400">{a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Newsletter signup */}
      <div className="mt-16 mx-auto max-w-2xl">
        <NewsletterSignup source="pricing" variant="inline" />
      </div>

      {/* Enterprise contact form */}
      <div id="enterprise" className="mt-20 mx-auto max-w-2xl">
        <ContactForm />
      </div>
    </div>
  )
}
