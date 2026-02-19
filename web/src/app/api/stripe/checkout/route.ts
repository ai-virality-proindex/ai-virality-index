import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient } from '../../../../lib/supabase-server'
import { createServerClient } from '../../../../lib/supabase'
import { getStripe, getOrCreatePrice, PLANS, resolvePlanKey } from '../../../../lib/stripe'

export async function POST(request: NextRequest) {
  const supabase = await createAuthServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  let body: { plan?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  const planKey = resolvePlanKey(body.plan || '')
  if (!planKey) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid plan' } },
      { status: 400 }
    )
  }

  const plan = PLANS[planKey]
  const stripe = getStripe()
  const admin = createServerClient()

  // Get or create Stripe customer
  const { data: profile } = await admin
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  let customerId = profile?.stripe_customer_id

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id

    await admin
      .from('user_profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  }

  // Get or create the price
  const priceId = await getOrCreatePrice(planKey)

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    ...(plan.trialDays > 0
      ? { subscription_data: { trial_period_days: plan.trialDays } }
      : {}),
    success_url: `${request.nextUrl.origin}/dashboard?welcome=true&plan=${planKey}`,
    cancel_url: `${request.nextUrl.origin}/pricing?checkout=cancelled`,
    metadata: {
      supabase_user_id: user.id,
      avi_plan: planKey,
    },
  })

  return NextResponse.json({ data: { url: session.url } })
}
