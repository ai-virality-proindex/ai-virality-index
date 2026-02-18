'use client'

import { useEffect, useState } from 'react'
import { createAuthBrowserClient } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const supabase = createAuthBrowserClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    const supabase = createAuthBrowserClient()
    await supabase.auth.signOut()
    setUser(null)
    setMenuOpen(false)
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="h-8 w-8 animate-pulse rounded-full bg-avi-border" />
    )
  }

  if (!user) {
    return (
      <a
        href="/login"
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
      >
        Sign in
      </a>
    )
  }

  const initials = (user.email ?? 'U')[0].toUpperCase()

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white transition-colors hover:bg-emerald-500"
        title={user.email ?? 'Account'}
      >
        {initials}
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-56 rounded-lg border border-avi-border bg-avi-card py-2 shadow-xl">
            <div className="border-b border-avi-border px-4 py-2">
              <p className="text-sm text-white truncate">{user.email}</p>
              <p className="text-xs text-slate-500">Free plan</p>
            </div>
            <a
              href="/dashboard"
              className="block px-4 py-2 text-sm text-slate-300 hover:bg-avi-dark hover:text-white transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              Dashboard
            </a>
            <a
              href="/dashboard/keys"
              className="block px-4 py-2 text-sm text-slate-300 hover:bg-avi-dark hover:text-white transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              API Keys
            </a>
            <a
              href="/dashboard/alerts"
              className="block px-4 py-2 text-sm text-slate-300 hover:bg-avi-dark hover:text-white transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              Alerts
            </a>
            <a
              href="/pricing"
              className="block px-4 py-2 text-sm text-slate-300 hover:bg-avi-dark hover:text-white transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              Upgrade to Pro
            </a>
            <div className="border-t border-avi-border mt-1 pt-1">
              <button
                onClick={handleSignOut}
                className="block w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-avi-dark hover:text-red-300 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
