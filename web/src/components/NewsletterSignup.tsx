'use client'

import { useState } from 'react'
import { trackConversion } from '../lib/analytics'

interface NewsletterSignupProps {
  source?: string
  variant?: 'inline' | 'banner'
}

export default function NewsletterSignup({ source = 'landing', variant = 'inline' }: NewsletterSignupProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setStatus('sending')

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      })

      if (res.ok) {
        setStatus('sent')
        setEmail('')
        trackConversion('newsletter_signup', { source })
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  // Banner variant — slim horizontal strip for dashboard
  if (variant === 'banner') {
    if (status === 'sent') {
      return (
        <div className="rounded-lg border border-emerald-800 bg-emerald-900/20 px-4 py-3 text-center">
          <p className="text-sm text-emerald-400 font-medium">Subscribed! Check your inbox for weekly updates.</p>
        </div>
      )
    }

    return (
      <form onSubmit={handleSubmit} className="rounded-lg border border-avi-border bg-avi-card px-4 py-3 flex flex-col sm:flex-row items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
          <span className="text-sm text-slate-300 font-medium">Get weekly AI virality insights</span>
        </div>
        <div className="flex w-full sm:w-auto gap-2 flex-1">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 sm:w-64 rounded-lg border border-avi-border bg-avi-dark px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition-colors"
            placeholder="you@email.com"
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 shrink-0"
          >
            {status === 'sending' ? '...' : 'Subscribe'}
          </button>
        </div>
        {status === 'error' && (
          <p className="text-xs text-red-400">Something went wrong. Try again.</p>
        )}
      </form>
    )
  }

  // Inline variant — card with heading for landing/pricing
  if (status === 'sent') {
    return (
      <div className="rounded-2xl border border-emerald-800 bg-emerald-900/10 p-8 text-center">
        <p className="text-3xl mb-3">&#9993;</p>
        <h3 className="text-lg font-bold text-white mb-2">You&apos;re in!</h3>
        <p className="text-sm text-slate-400">We&apos;ll send you weekly AI virality insights. No spam, unsubscribe anytime.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-avi-border bg-avi-card p-8 text-center">
      <h3 className="text-xl font-bold text-white mb-2">Stay ahead of the AI curve</h3>
      <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
        Free weekly digest: top movers, emerging trends, and trading signals. Join 1,000+ traders and creators.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-lg border border-avi-border bg-avi-dark px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition-colors"
          placeholder="you@email.com"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 shrink-0"
        >
          {status === 'sending' ? 'Subscribing...' : 'Subscribe free'}
        </button>
      </form>
      {status === 'error' && (
        <p className="text-sm text-red-400 mt-3">Something went wrong. Please try again.</p>
      )}
      <p className="text-xs text-slate-600 mt-4">No spam. Unsubscribe anytime.</p>
    </div>
  )
}
