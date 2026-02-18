import { redirect } from 'next/navigation'
import { createAuthServerClient } from './supabase-server'

export type UserProfile = {
  id: string
  plan: 'free' | 'pro' | 'enterprise'
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: string
}

// Get current user from session (returns null if not authenticated)
export async function getUser() {
  const supabase = await createAuthServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

// Get current user + profile (returns null if not authenticated)
export async function getUserWithProfile() {
  const supabase = await createAuthServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return { user, profile: profile as UserProfile | null }
}

// Require authentication — redirects to /login if not authenticated
export async function requireAuth() {
  const user = await getUser()
  if (!user) {
    redirect('/login')
  }
  return user
}

// Require Pro plan — redirects to /pricing if not Pro
export async function requirePro() {
  const result = await getUserWithProfile()
  if (!result) {
    redirect('/login')
  }
  if (result.profile?.plan !== 'pro' && result.profile?.plan !== 'enterprise') {
    redirect('/pricing')
  }
  return result
}
