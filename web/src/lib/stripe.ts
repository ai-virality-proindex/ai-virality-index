import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  }
  return _stripe
}

// Product/Price IDs — create these in Stripe Dashboard (test mode) first,
// then paste IDs here. For now, we create them dynamically on first use.
export const PLANS = {
  pro_trader: {
    name: 'Pro Trader',
    price: 2900, // cents
    interval: 'month' as const,
    features: [
      'Real-time data (no delay)',
      'Full history access',
      'Component breakdown (T/S/G/N/Q/M)',
      'Trading signals & divergence alerts',
      'API: 600 req/min',
    ],
    dbPlan: 'pro' as const,
  },
  pro_builder: {
    name: 'Pro Builder',
    price: 9900, // cents
    interval: 'month' as const,
    features: [
      'Everything in Pro Trader',
      'API: 3,000 req/min',
      'Webhook alerts',
      'CSV data export',
      'Priority support',
    ],
    dbPlan: 'enterprise' as const,
  },
} as const

export type PlanKey = keyof typeof PLANS

// Get or create a Stripe price for a plan
export async function getOrCreatePrice(planKey: PlanKey): Promise<string> {
  const stripe = getStripe()
  const plan = PLANS[planKey]

  // Search for existing price by metadata
  const prices = await stripe.prices.search({
    query: `metadata["avi_plan"]:"${planKey}" AND active:"true"`,
  })

  if (prices.data.length > 0) {
    return prices.data[0].id
  }

  // Create product + price
  const product = await stripe.products.create({
    name: `AI Virality Index — ${plan.name}`,
    metadata: { avi_plan: planKey },
  })

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: plan.price,
    currency: 'usd',
    recurring: { interval: plan.interval },
    metadata: { avi_plan: planKey },
  })

  return price.id
}
