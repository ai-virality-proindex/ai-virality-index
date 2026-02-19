'use client'

import { useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { trackConversion } from '@/lib/analytics'

function ReportSuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    if (!sessionId) return
    setDownloading(true)
    trackConversion('checkout_completed', { plan: 'weekly_report' })

    try {
      const res = await fetch(`/api/report/latest?session_id=${sessionId}`)

      if (!res.ok) {
        const err = await res.json()
        alert(err.error?.message || 'Failed to download report')
        setDownloading(false)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `AVI-Weekly-Report-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setDownloading(false)
    } catch {
      setDownloading(false)
      alert('Download failed. Please try again.')
    }
  }

  if (!sessionId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-slate-400">Invalid session. Please purchase the report first.</p>
        <Link href="/report" className="text-emerald-400 hover:text-emerald-300 text-sm mt-4 inline-block">
          Go to Report page &rarr;
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="rounded-2xl border border-emerald-800 bg-emerald-900/10 p-10">
        <div className="w-16 h-16 rounded-full bg-emerald-900/40 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">Payment Successful!</h1>
        <p className="text-slate-400 mb-8">
          Your AI Virality Weekly Report is ready to download.
        </p>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full rounded-lg bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 mb-4"
        >
          {downloading ? 'Generating PDF...' : 'Download Report (PDF)'}
        </button>

        <div className="mt-8 pt-6 border-t border-avi-border/50 space-y-3">
          <Link
            href="/dashboard"
            className="block text-sm text-slate-400 hover:text-white transition-colors"
          >
            Open Dashboard &rarr;
          </Link>
          <Link
            href="/pricing"
            className="block text-sm text-slate-400 hover:text-white transition-colors"
          >
            Upgrade to Pro for real-time data &rarr;
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function ReportSuccessPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    }>
      <ReportSuccessContent />
    </Suspense>
  )
}
