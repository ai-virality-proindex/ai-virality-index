'use client'

import { useState, useEffect } from 'react'

/** ETL schedule: every 6 hours at 00:00, 06:00, 12:00, 18:00 UTC */
const ETL_HOURS = [0, 6, 12, 18]

function getNextUpdateUTC(): Date {
  const now = new Date()
  const currentHourUTC = now.getUTCHours()
  const currentMinUTC = now.getUTCMinutes()

  // Find next scheduled hour
  for (const h of ETL_HOURS) {
    if (h > currentHourUTC || (h === currentHourUTC && currentMinUTC === 0)) {
      const next = new Date(now)
      next.setUTCHours(h, 0, 0, 0)
      return next
    }
  }

  // Wrap to next day 00:00 UTC
  const next = new Date(now)
  next.setUTCDate(next.getUTCDate() + 1)
  next.setUTCHours(0, 0, 0, 0)
  return next
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'updating...'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${h}:${pad(m)}:${pad(s)}`
}

function formatTime(dateStr: string): string {
  // If ISO timestamp with time (e.g. "2026-02-18T01:41:21+00:00"), show "Feb 18, 01:41 UTC"
  if (dateStr.includes('T')) {
    const d = new Date(dateStr)
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    const day = d.getUTCDate()
    const hh = String(d.getUTCHours()).padStart(2, '0')
    const mm = String(d.getUTCMinutes()).padStart(2, '0')
    return `${month} ${day}, ${hh}:${mm} UTC`
  }
  // Plain date like "2026-02-18"
  const d = new Date(dateStr + 'T00:00:00Z')
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const day = d.getUTCDate()
  return `${month} ${day}`
}

interface UpdateCountdownProps {
  lastDate: string
  /** compact = inline text, full = card-style with more detail */
  variant?: 'compact' | 'full'
}

export default function UpdateCountdown({ lastDate, variant = 'compact' }: UpdateCountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null)
  const [nextUpdate, setNextUpdate] = useState<Date | null>(null)

  useEffect(() => {
    const next = getNextUpdateUTC()
    setNextUpdate(next)
    setRemaining(next.getTime() - Date.now())

    const interval = setInterval(() => {
      const diff = next.getTime() - Date.now()
      if (diff <= 0) {
        // Recalculate next update
        const newNext = getNextUpdateUTC()
        setNextUpdate(newNext)
        setRemaining(newNext.getTime() - Date.now())
      } else {
        setRemaining(diff)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  if (remaining === null) {
    // SSR / first render — show static text
    return (
      <p className="text-sm text-slate-500">
        Last updated: {formatTime(lastDate)}
      </p>
    )
  }

  const countdownStr = formatCountdown(remaining)
  const nextTimeStr = nextUpdate
    ? nextUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' })
    : ''

  if (variant === 'full') {
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-400">Last Updated</span>
          <span className="text-sm text-slate-300">{formatTime(lastDate)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-400">Next Update</span>
          <span className="text-sm font-mono text-emerald-400">{countdownStr}</span>
        </div>
      </div>
    )
  }

  // compact variant
  return (
    <div className="flex items-center gap-3 text-sm text-slate-500">
      <span>Updated: {formatTime(lastDate)}</span>
      <span className="text-slate-700">|</span>
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="font-mono text-slate-400">{countdownStr}</span>
      </span>
    </div>
  )
}
