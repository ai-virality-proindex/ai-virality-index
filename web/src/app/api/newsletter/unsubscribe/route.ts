import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase'
import crypto from 'crypto'

const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || 'avi-unsub-secret-2026'

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email')
  const token = request.nextUrl.searchParams.get('token')

  if (!email || !token) {
    return new NextResponse(renderPage('Missing email or token.', false), {
      headers: { 'Content-Type': 'text/html' },
      status: 400,
    })
  }

  // Verify HMAC token
  const expectedToken = crypto
    .createHmac('sha256', UNSUBSCRIBE_SECRET)
    .update(email)
    .digest('hex')
    .slice(0, 32)

  if (token !== expectedToken) {
    return new NextResponse(renderPage('Invalid unsubscribe link.', false), {
      headers: { 'Content-Type': 'text/html' },
      status: 400,
    })
  }

  // Mark as inactive
  const admin = createServerClient()
  const { error } = await admin
    .from('newsletter_subscribers')
    .update({ is_active: false })
    .eq('email', email.toLowerCase())

  if (error) {
    console.error('Unsubscribe error:', error)
    return new NextResponse(renderPage('Something went wrong. Please try again.', false), {
      headers: { 'Content-Type': 'text/html' },
      status: 500,
    })
  }

  return new NextResponse(renderPage('You have been unsubscribed successfully.', true), {
    headers: { 'Content-Type': 'text/html' },
  })
}

function renderPage(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe — AI Virality Index</title>
  <style>
    body { margin:0; padding:0; background:#0F172A; color:#E2E8F0; font-family:system-ui,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .card { background:#1E293B; border:1px solid #334155; border-radius:16px; padding:48px; text-align:center; max-width:400px; }
    .icon { font-size:48px; margin-bottom:16px; }
    h1 { font-size:20px; margin:0 0 8px; color:#fff; }
    p { font-size:14px; color:#94A3B8; margin:0 0 24px; }
    a { color:#10B981; text-decoration:none; font-size:14px; }
    a:hover { text-decoration:underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '&#10004;' : '&#10006;'}</div>
    <h1>${success ? 'Unsubscribed' : 'Error'}</h1>
    <p>${message}</p>
    <a href="https://aiviralityindex.com">Back to AI Virality Index</a>
  </div>
</body>
</html>`
}
