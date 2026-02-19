import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  }
  return _stripe
}

export const PLANS = {
  pro_trader_monthly: {
    name: 'Pro Trader',
    price: 2900, // cents
    interval: 'month' as const,
    trialDays: 7,
    features: [
      'Real-time data (no delay)',
      'Full history access',
      'Component breakdown (T/S/G/N/D/M)',
      'Trading signals & divergence alerts',
      'API: 600 req/min',
    ],
    dbPlan: 'pro' as const,
  },
  pro_trader_annual: {
    name: 'Pro Trader (Annual)',
    price: 24900, // $249/yr — save 28% vs $29*12=$348
    interval: 'year' as const,
    trialDays: 7,
    features: [
      'Real-time data (no delay)',
      'Full history access',
      'Component breakdown (T/S/G/N/D/M)',
      'Trading signals & divergence alerts',
      'API: 600 req/min',
    ],
    dbPlan: 'pro' as const,
  },
  pro_builder_monthly: {
    name: 'Pro Builder',
    price: 9900, // cents
    interval: 'month' as const,
    trialDays: 0,
    features: [
      'Everything in Pro Trader',
      'API: 3,000 req/min',
      'Webhook alerts',
      'CSV data export',
      'Priority support',
    ],
    dbPlan: 'enterprise' as const,
  },
  pro_builder_annual: {
    name: 'Pro Builder (Annual)',
    price: 89900, // $899/yr — save 25% vs $99*12=$1188
    interval: 'year' as const,
    trialDays: 0,
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

/** Resolve legacy plan keys (pro_trader, pro_builder) to new monthly keys */
export function resolvePlanKey(key: string): PlanKey | null {
  if (key in PLANS) return key as PlanKey
  if (key === 'pro_trader') return 'pro_trader_monthly'
  if (key === 'pro_builder') return 'pro_builder_monthly'
  return null
}

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
