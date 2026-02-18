import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/dashboard'
  // Prevent open redirect: only allow relative paths
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

  if (code) {
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

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Session is now active. Ensure user_profiles row exists.
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Use service role to upsert profile (RLS may block anon)
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

  // If code exchange failed, redirect to login with error
  return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
}
