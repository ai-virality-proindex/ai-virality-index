// Conversion event tracking for GA4

type ConversionEvent =
  | 'pricing_viewed'
  | 'checkout_started'
  | 'checkout_completed'
  | 'signup_completed'
  | 'upsell_clicked'
  | 'trial_started'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export function trackConversion(event: ConversionEvent, params?: Record<string, string | number>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', event, {
      event_category: 'conversion',
      ...params,
    })
  }
}
