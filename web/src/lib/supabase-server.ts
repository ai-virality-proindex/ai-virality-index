import { createServerClient as createSSRServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server client for server components / route handlers (auth-aware, reads cookies)
// IMPORTANT: Do NOT import this file from client components — it uses next/headers
export async function createAuthServerClient() {
  const cookieStore = await cookies()
  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as never)
            )
          } catch {
            // setAll called from a Server Component — ignore
          }
        },
      },
    }
  )
}
