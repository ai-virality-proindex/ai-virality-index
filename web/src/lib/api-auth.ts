import { NextRequest, NextResponse } from 'next/server'

const PRO_PLANS = ['pro', 'enterprise']

/**
 * Check if request has Pro (or higher) plan access.
 * Middleware sets X-User-Plan header for authenticated requests.
 * Returns null if authorized, or a 403 NextResponse if not.
 */
export function requirePro(request: NextRequest): NextResponse | null {
  const plan = request.headers.get('x-user-plan')

  if (!plan || !PRO_PLANS.includes(plan)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'This endpoint requires a Pro or Enterprise subscription. Include your API key: Authorization: Bearer avi_pk_...',
        },
      },
      { status: 403 }
    )
  }

  return null // authorized
}
