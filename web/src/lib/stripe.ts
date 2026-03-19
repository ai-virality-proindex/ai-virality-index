import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  }
  return _stripe
}

export const PLANS = {
  pro_monthly: {
    name: 'Pro',
    price: 1900, // $19/mo
    interval: 'month' as const,
    trialDays: 7,
    features: [
      'Real-time data (no delay)',
      'Full history access',
      'Component breakdown',
      'CSV data export',
      'Webhook alerts',
      'API: 600 req/min',
    ],
    dbPlan: 'pro' as const,
  },
  pro_annual: {
    name: 'Pro (Annual)',
    price: 16900, // $169/yr — save 26% vs $19*12=$228
    interval: 'year' as const,
    trialDays: 7,
    features: [
      'Real-time data (no delay)',
      'Full history access',
      'Component breakdown',
      'CSV data export',
      'Webhook alerts',
      'API: 600 req/min',
    ],
    dbPlan: 'pro' as const,
  },
  team_monthly: {
    name: 'Team',
    price: 7900, // $79/mo
    interval: 'month' as const,
    trialDays: 0,
    features: [
      'Everything in Pro',
      'API: 3,000 req/min',
      'Priority support',
    ],
    dbPlan: 'enterprise' as const,
  },
  team_annual: {
    name: 'Team (Annual)',
    price: 69900, // $699/yr — save 26% vs $79*12=$948
    interval: 'year' as const,
    trialDays: 0,
    features: [
      'Everything in Pro',
      'API: 3,000 req/min',
      'Priority support',
    ],
    dbPlan: 'enterprise' as const,
  },
} as const

export type PlanKey = keyof typeof PLANS

/** Resolve legacy and current plan keys */
export function resolvePlanKey(key: string): PlanKey | null {
  if (key in PLANS) return key as PlanKey
  // Legacy v0.1 keys
  if (key === 'pro_trader' || key === 'pro_trader_monthly') return 'pro_monthly'
  if (key === 'pro_trader_annual') return 'pro_annual'
  if (key === 'pro_builder' || key === 'pro_builder_monthly') return 'team_monthly'
  if (key === 'pro_builder_annual') return 'team_annual'
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
