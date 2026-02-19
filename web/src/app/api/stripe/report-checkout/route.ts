import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '../../../../lib/stripe'
import { createServerClient } from '../../../../lib/supabase'

export async function POST(request: NextRequest) {
  // Get user from auth header or session
  const admin = createServerClient()
  const authHeader = request.headers.get('authorization')
  let userId: string | null = null
  let userEmail: string | null = null

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const { data: { user } } = await admin.auth.getUser(token)
    if (user) {
      userId = user.id
      userEmail = user.email || null
    }
  }

  // Also try to get from cookie-based auth
  if (!userId) {
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
      // Extract access_token from cookies
      const match = cookieHeader.match(/sb-[^-]+-auth-token=([^;]+)/)
      if (match) {
        try {
          const tokenData = JSON.parse(decodeURIComponent(match[1]))
          const accessToken = Array.isArray(tokenData) ? tokenData[0] : tokenData?.access_token
          if (accessToken) {
            const { data: { user } } = await admin.auth.getUser(accessToken)
            if (user) {
              userId = user.id
              userEmail = user.email || null
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  const stripe = getStripe()
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://aiviralityindex.com'

  try {
    // Search for or create a one-time report price
    const prices = await stripe.prices.search({
      query: 'metadata["avi_product"]:"weekly_report" AND active:"true"',
    })

    let priceId: string

    if (prices.data.length > 0) {
      priceId = prices.data[0].id
    } else {
      // Create product + price
      const product = await stripe.products.create({
        name: 'AI Virality Weekly Report (PDF)',
        description: 'Comprehensive weekly AI virality analysis — scores, movers, component breakdown, and signals.',
        metadata: { avi_product: 'weekly_report' },
      })

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: 700, // $7.00
        currency: 'usd',
        metadata: { avi_product: 'weekly_report' },
      })

      priceId = price.id
    }

    const sessionParams: Record<string, unknown> = {
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/report/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/report`,
      metadata: {
        avi_product: 'weekly_report',
        ...(userId ? { supabase_user_id: userId } : {}),
      },
    }

    if (userEmail) {
      (sessionParams as Record<string, unknown>).customer_email = userEmail
    }

    const session = await stripe.checkout.sessions.create(sessionParams as Parameters<typeof stripe.checkout.sessions.create>[0])

    return NextResponse.json({ data: { url: session.url } })
  } catch (err) {
    console.error('Report checkout error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Failed to create checkout session' } },
      { status: 500 }
    )
  }
}
