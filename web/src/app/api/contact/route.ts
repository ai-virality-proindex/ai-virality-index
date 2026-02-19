import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../lib/supabase'

export async function POST(request: NextRequest) {
  let body: { name?: string; email?: string; company?: string; message?: string } = {}

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } },
      { status: 400 }
    )
  }

  const { name, email, company, message } = body

  if (!name || !email || !message) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Name, email, and message are required' } },
      { status: 400 }
    )
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid email address' } },
      { status: 400 }
    )
  }

  const admin = createServerClient()

  const { error } = await admin
    .from('contact_requests')
    .insert({
      name,
      email,
      company: company || null,
      message,
    })

  if (error) {
    console.error('Contact form error:', error)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Failed to save message' } },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: { success: true } })
}
