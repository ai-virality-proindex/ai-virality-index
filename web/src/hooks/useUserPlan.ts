'use client'

import { useEffect, useState } from 'react'
import { createAuthBrowserClient } from '../lib/supabase'

export type UserPlan = 'anon' | 'free' | 'pro' | 'enterprise'

interface UseUserPlanResult {
  plan: UserPlan
  loading: boolean
  userId: string | null
}

export function useUserPlan(): UseUserPlanResult {
  const [plan, setPlan] = useState<UserPlan>('anon')
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createAuthBrowserClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setPlan('anon')
        setLoading(false)
        return
      }
      setUserId(user.id)
      setPlan('free')

      supabase
        .from('user_profiles')
        .select('plan')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.plan) {
            setPlan(data.plan as UserPlan)
          }
          setLoading(false)
        })
    })
  }, [])

  return { plan, loading, userId }
}
