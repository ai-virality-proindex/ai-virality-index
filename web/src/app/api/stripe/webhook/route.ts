import { NextRequest, NextResponse } from 'next/server'
import { getStripe, PLANS, resolvePlanKey } from '../../../../lib/stripe'
import { createServerClient } from '../../../../lib/supabase'
import Stripe from 'stripe'

// Disable body parsing — Stripe needs the raw body for signature verification
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const stripe = getStripe()
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  // If webhook secret is set, verify the signature
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  let event: Stripe.Event

  if (!webhookSecret) {
    // In production, refuse to process unverified webhooks
    if (process.env.NODE_ENV === 'production') {
      console.error('STRIPE_WEBHOOK_SECRET is not set. Refusing to process webhook in production.')
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'Webhook not configured' } },
        { status: 500 }
      )
    }
    // Development only: parse without verification
    try {
      event = JSON.parse(body) as Stripe.Event
    } catch {
      return NextResponse.json(
        { error: { code: 'WEBHOOK_ERROR', message: 'Invalid JSON' } },
        { status: 400 }
      )
    }
  } else {
    if (!sig) {
      return NextResponse.json(
        { error: { code: 'WEBHOOK_ERROR', message: 'Missing stripe-signature header' } },
        { status: 400 }
      )
    }
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Webhook signature verification failed:', message)
      return NextResponse.json(
        { error: { code: 'WEBHOOK_ERROR', message: `Signature verification failed: ${message}` } },
        { status: 400 }
      )
    }
  }

  const admin = createServerClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.supabase_user_id
      const resolvedKey = resolvePlanKey(session.metadata?.avi_plan || '')

      if (userId && resolvedKey) {
        const dbPlan = PLANS[resolvedKey].dbPlan
        await admin
          .from('user_profiles')
          .update({
            plan: dbPlan,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', userId)

        console.log(`User ${userId} upgraded to ${dbPlan} (${resolvedKey})`)
      }
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string

      // Find user by stripe_customer_id and downgrade to free
      const { data: profiles } = await admin
        .from('user_profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)

      if (profiles && profiles.length > 0) {
        await admin
          .from('user_profiles')
          .update({
            plan: 'free',
            stripe_subscription_id: null,
          })
          .eq('stripe_customer_id', customerId)

        console.log(`Customer ${customerId} downgraded to free (subscription deleted)`)
      }
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string

      if (subscription.status === 'active') {
        // Check which plan this subscription corresponds to
        const priceId = subscription.items.data[0]?.price?.id
        if (priceId) {
          const price = await stripe.prices.retrieve(priceId)
          const subPlanKey = resolvePlanKey(price.metadata?.avi_plan || '')

          if (subPlanKey) {
            await admin
              .from('user_profiles')
              .update({
                plan: PLANS[subPlanKey].dbPlan,
                stripe_subscription_id: subscription.id,
              })
              .eq('stripe_customer_id', customerId)
          }
        }
      } else if (subscription.status === 'past_due' || subscription.status === 'canceled') {
        await admin
          .from('user_profiles')
          .update({ plan: 'free', stripe_subscription_id: null })
          .eq('stripe_customer_id', customerId)
      }
      break
    }

    default:
      // Unhandled event type — ignore
      break
  }

  return NextResponse.json({ received: true })
}
