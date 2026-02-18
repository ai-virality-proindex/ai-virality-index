import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { createMiddlewareClient } from './lib/supabase-middleware'
import crypto from 'crypto'

// Rate limiters (lazy-initialized to avoid build-time env access)
let publicLimiter: Ratelimit | null = null
let proLimiter: Ratelimit | null = null
let enterpriseLimiter: Ratelimit | null = null

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_URL!,
    token: process.env.UPSTASH_REDIS_TOKEN!,
  })
}

function getPublicLimiter() {
  if (!publicLimiter) {
    publicLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(60, '1 m'),
      prefix: 'rl:public',
    })
  }
  return publicLimiter
}

function getProLimiter() {
  if (!proLimiter) {
    proLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(600, '1 m'),
      prefix: 'rl:pro',
    })
  }
  return proLimiter
}

function getEnterpriseLimiter() {
  if (!enterpriseLimiter) {
    enterpriseLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(3000, '1 m'),
      prefix: 'rl:enterprise',
    })
  }
  return enterpriseLimiter
}

async function resolveApiKey(
  rawKey: string
): Promise<{ plan: string; userId: string } | null> {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Look up by SHA-256 hash of the full key (not plaintext)
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')

  const { data: keyRow, error } = await supabase
    .from('api_keys')
    .select('id, user_id, is_active')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single()

  if (error || !keyRow) return null

  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id)

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('plan')
    .eq('id', keyRow.user_id)
    .single()

  return {
    plan: profile?.plan ?? 'free',
    userId: keyRow.user_id,
  }
}

// ---- API rate limiting logic (for /api/v1/* routes) ----
async function handleApiRoute(request: NextRequest): Promise<NextResponse> {
  // Strip any incoming plan/user headers to prevent spoofing
  const headers = new Headers(request.headers)
  headers.delete('x-user-plan')
  headers.delete('x-user-id')

  const authHeader = request.headers.get('authorization')
  let apiKeyPrefix: string | null = null
  let plan = 'free'
  let userId: string | null = null

  if (authHeader?.startsWith('Bearer avi_pk_')) {
    apiKeyPrefix = authHeader.replace('Bearer ', '')

    const keyInfo = await resolveApiKey(apiKeyPrefix) // resolveApiKey hashes internally
    if (!keyInfo) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } },
        { status: 401 }
      )
    }

    plan = keyInfo.plan
    userId = keyInfo.userId
  } else if (authHeader && authHeader !== '') {
    return NextResponse.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message:
            'Invalid authorization format. Use: Authorization: Bearer avi_pk_...',
        },
      },
      { status: 401 }
    )
  }

  let limiter: Ratelimit
  let identifier: string

  if (plan === 'enterprise') {
    limiter = getEnterpriseLimiter()
    identifier = `enterprise:${userId}`
  } else if (plan === 'pro') {
    limiter = getProLimiter()
    identifier = `pro:${userId}`
  } else {
    limiter = getPublicLimiter()
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      '127.0.0.1'
    identifier = `ip:${ip}`
  }

  const { success, limit, remaining, reset } = await limiter.limit(identifier)

  if (!success) {
    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded. Limit: ${limit} req/min. Try again in ${Math.ceil((reset - Date.now()) / 1000)}s.`,
        },
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': reset.toString(),
          'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      }
    )
  }

  const response = NextResponse.next({
    request: { headers },
  })
  response.headers.set('X-RateLimit-Limit', limit.toString())
  response.headers.set('X-RateLimit-Remaining', remaining.toString())
  response.headers.set('X-RateLimit-Reset', reset.toString())

  if (plan !== 'free') {
    headers.set('x-user-plan', plan)
    headers.set('x-user-id', userId ?? '')
  }

  return response
}

// ---- Main middleware ----
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // API routes: rate limiting + API key auth (existing logic)
  if (pathname.startsWith('/api/v1')) {
    return handleApiRoute(request)
  }

  // All other routes: refresh Supabase auth session via cookies
  const response = NextResponse.next()
  const supabase = createMiddlewareClient(request, response)

  // Refresh session — this ensures expired tokens are renewed
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    // API routes
    '/api/v1/:path*',
    // All pages except static files and _next internals
    '/((?!_next/static|_next/image|favicon.ico|models/.*\\.png|og-image\\.png).*)',
  ],
}
