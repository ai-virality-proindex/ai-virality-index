import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Handles the token_hash + type from Supabase magic link emails
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'email' | 'magiclink' | null
  const rawNext = searchParams.get('next') ?? '/dashboard'
  // Prevent open redirect: only allow relative paths
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

  if (token_hash && type) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as never)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.verifyOtp({ token_hash, type })

    if (!error) {
      // Session is now active. Ensure user_profiles row exists.
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { createClient } = await import('@supabase/supabase-js')
        const adminClient = createClient(
          process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        await adminClient
          .from('user_profiles')
          .upsert(
            {
              id: user.id,
              plan: 'free',
              created_at: new Date().toISOString(),
            },
            { onConflict: 'id', ignoreDuplicates: true }
          )
      }

      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  return NextResponse.redirect(new URL('/login?error=invalid_link', request.url))
}
