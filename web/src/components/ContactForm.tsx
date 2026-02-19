'use client'

import { useState } from 'react'

export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (res.ok) {
        setStatus('sent')
        setForm({ name: '', email: '', company: '', message: '' })
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="rounded-2xl border border-avi-border bg-avi-card p-8 text-center">
        <p className="text-3xl mb-3">&#10004;</p>
        <h3 className="text-lg font-bold text-white mb-2">Message sent!</h3>
        <p className="text-sm text-slate-400">We&apos;ll get back to you within 24 hours.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-avi-border bg-avi-card p-8 space-y-4">
      <h3 className="text-lg font-bold text-white mb-1">Enterprise</h3>
      <p className="text-sm text-slate-400 mb-4">
        Custom indices, SLA, white-label, and dedicated support. Starting at $499/mo.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Name *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-avi-border bg-avi-dark px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition-colors"
            placeholder="Jane Doe"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Email *</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-lg border border-avi-border bg-avi-dark px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition-colors"
            placeholder="jane@company.com"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-1">Company</label>
        <input
          type="text"
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
          className="w-full rounded-lg border border-avi-border bg-avi-dark px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition-colors"
          placeholder="Acme Inc."
        />
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-1">Message *</label>
        <textarea
          required
          rows={4}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          className="w-full rounded-lg border border-avi-border bg-avi-dark px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition-colors resize-none"
          placeholder="Tell us about your use case..."
        />
      </div>

      {status === 'error' && (
        <p className="text-sm text-red-400">Something went wrong. Please try again.</p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
      >
        {status === 'sending' ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  )
}
