import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient } from '../../../../lib/supabase-server'
import { createServerClient } from '../../../../lib/supabase'
import { getStripe } from '../../../../lib/stripe'

export async function POST(request: NextRequest) {
  const supabase = await createAuthServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const admin = createServerClient()
  const { data: profile } = await admin
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No active subscription found' } },
      { status: 404 }
    )
  }

  const stripe = getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${request.nextUrl.origin}/dashboard`,
  })

  return NextResponse.json({ data: { url: session.url } })
}
