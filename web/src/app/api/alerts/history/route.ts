import { NextResponse } from 'next/server'
import { createAuthServerClient } from '../../../../lib/supabase-server'
import { createServerClient } from '../../../../lib/supabase'

// GET /api/alerts/history — list alert notification history
export async function GET() {
  const supabase = await createAuthServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const admin = createServerClient()

  const { data: history, error } = await admin
    .from('alert_history')
    .select('*, models(slug, name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    )
  }

  return NextResponse.json({
    data: history.map((h: any) => ({
      id: h.id,
      model_slug: h.models?.slug,
      model_name: h.models?.name,
      condition: h.condition,
      triggered_value: h.triggered_value,
      threshold: h.threshold,
      message: h.message,
      delivered: h.delivered,
      created_at: h.created_at,
    })),
    meta: { count: history.length },
  })
}
