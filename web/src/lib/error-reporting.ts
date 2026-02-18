/**
 * Lightweight error reporting stub.
 * Replace with @sentry/nextjs when ready:
 *   npm install @sentry/nextjs
 *   npx @sentry/wizard@latest -i nextjs
 *
 * Set NEXT_PUBLIC_SENTRY_DSN in .env to enable.
 */

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (SENTRY_DSN) {
    // When Sentry is configured, this would call Sentry.captureException(error, { extra: context })
    console.error('[Sentry]', error, context)
  } else {
    console.error('[Error]', error, context)
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  if (SENTRY_DSN) {
    console.log(`[Sentry:${level}]`, message)
  }
}
