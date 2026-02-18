import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient } from '../../../lib/supabase-server'
import { createServerClient } from '../../../lib/supabase'
import { z } from 'zod'

const VALID_CONDITIONS = ['vi_above', 'vi_below', 'delta7_above', 'delta7_below', 'new_signal'] as const
const VALID_CHANNELS = ['webhook', 'email'] as const
const VALID_MODES = ['trade', 'content'] as const

const createAlertSchema = z.object({
  model_slug: z.string().min(1),
  condition: z.enum(VALID_CONDITIONS),
  threshold: z.number().nullable().optional(),
  mode: z.enum(VALID_MODES).default('trade'),
  channel: z.enum(VALID_CHANNELS).default('webhook'),
  webhook_url: z.string().url().optional().nullable(),
})

// GET /api/alerts — list user's alerts
export async function GET() {
  const supabase = await createAuthServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  // Check Pro plan
  const admin = createServerClient()
  const { data: profile } = await admin
    .from('user_profiles')
    .select('plan')
    .eq('id', user.id)
    .single()

  if (!profile || !['pro', 'enterprise'].includes(profile.plan)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Alerts require a Pro subscription' } },
      { status: 403 }
    )
  }

  const { data: alerts, error } = await admin
    .from('alerts')
    .select('*, models(slug, name, color)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    )
  }

  return NextResponse.json({
    data: alerts.map((a: any) => ({
      id: a.id,
      model_slug: a.models?.slug,
      model_name: a.models?.name,
      model_color: a.models?.color,
      condition: a.condition,
      threshold: a.threshold,
      mode: a.mode,
      channel: a.channel,
      webhook_url: a.webhook_url,
      is_active: a.is_active,
      last_triggered_at: a.last_triggered_at,
      created_at: a.created_at,
    })),
    meta: { count: alerts.length },
  })
}

// POST /api/alerts — create a new alert
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

  // Check Pro plan
  const { data: profile } = await admin
    .from('user_profiles')
    .select('plan')
    .eq('id', user.id)
    .single()

  if (!profile || !['pro', 'enterprise'].includes(profile.plan)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Alerts require a Pro subscription' } },
      { status: 403 }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  const parsed = createAlertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
      { status: 400 }
    )
  }

  const { model_slug, condition, threshold, mode, channel, webhook_url } = parsed.data

  // Validate: non-signal conditions require a threshold
  if (condition !== 'new_signal' && (threshold === null || threshold === undefined)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Threshold is required for this condition' } },
      { status: 400 }
    )
  }

  // Validate: webhook channel requires a URL
  if (channel === 'webhook' && !webhook_url) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Webhook URL is required for webhook channel' } },
      { status: 400 }
    )
  }

  // Look up model by slug
  const { data: model } = await admin
    .from('models')
    .select('id')
    .eq('slug', model_slug)
    .eq('is_active', true)
    .single()

  if (!model) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Model not found: ${model_slug}` } },
      { status: 404 }
    )
  }

  // Max 20 alerts per user
  const { count } = await admin
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_active', true)

  if ((count ?? 0) >= 20) {
    return NextResponse.json(
      { error: { code: 'LIMIT_REACHED', message: 'Maximum 20 active alerts per account' } },
      { status: 400 }
    )
  }

  const { data: newAlert, error } = await admin
    .from('alerts')
    .insert({
      user_id: user.id,
      model_id: model.id,
      condition,
      threshold: threshold ?? null,
      mode,
      channel,
      webhook_url: webhook_url ?? null,
      is_active: true,
    })
    .select('id, condition, threshold, mode, channel, webhook_url, is_active, created_at')
    .single()

  if (error) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    )
  }

  return NextResponse.json({
    data: { ...newAlert, model_slug },
  }, { status: 201 })
}

// PATCH /api/alerts — toggle alert active/inactive
export async function PATCH(request: NextRequest) {
  const supabase = await createAuthServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  let body: { id?: string; is_active?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  if (!body.id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing alert id' } },
      { status: 400 }
    )
  }

  const admin = createServerClient()

  // Verify ownership
  const { data: existing } = await admin
    .from('alerts')
    .select('id, user_id')
    .eq('id', body.id)
    .single()

  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Alert not found' } },
      { status: 404 }
    )
  }

  const { error } = await admin
    .from('alerts')
    .update({ is_active: body.is_active ?? false })
    .eq('id', body.id)

  if (error) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    )
  }

  return NextResponse.json({
    data: { id: body.id, is_active: body.is_active ?? false },
  })
}

// DELETE /api/alerts — delete an alert
export async function DELETE(request: NextRequest) {
  const supabase = await createAuthServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const alertId = searchParams.get('id')

  if (!alertId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing alert id' } },
      { status: 400 }
    )
  }

  const admin = createServerClient()

  // Verify ownership
  const { data: existing } = await admin
    .from('alerts')
    .select('id, user_id')
    .eq('id', alertId)
    .single()

  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Alert not found' } },
      { status: 404 }
    )
  }

  await admin
    .from('alerts')
    .delete()
    .eq('id', alertId)

  return NextResponse.json({ data: { id: alertId, deleted: true } })
}
