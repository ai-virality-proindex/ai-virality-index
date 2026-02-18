import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient } from '../../../lib/supabase-server'
import { createServerClient } from '../../../lib/supabase'
import crypto from 'crypto'

// GET /api/keys — list user's API keys
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
  const { data: keys, error } = await admin
    .from('api_keys')
    .select('id, key_prefix, name, is_active, last_used_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    )
  }

  return NextResponse.json({
    data: keys.map((k) => ({
      id: k.id,
      prefix: k.key_prefix.slice(0, 15) + '...',
      name: k.name,
      is_active: k.is_active,
      last_used_at: k.last_used_at,
      created_at: k.created_at,
    })),
  })
}

// POST /api/keys — create a new API key
export async function POST(request: NextRequest) {
  const supabase = await createAuthServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  let body: { name?: string } = {}
  try {
    body = await request.json()
  } catch {
    // empty body is fine
  }

  const keyName = body.name || 'Default'

  // Generate key: avi_pk_ + 32 hex chars
  const rawKey = `avi_pk_${crypto.randomBytes(16).toString('hex')}`

  // Store only a short prefix for display (NOT the full key)
  // Store SHA-256 hash for authentication lookup
  const keyPrefix = rawKey.slice(0, 15) // "avi_pk_" + first 8 hex chars
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')

  const admin = createServerClient()

  // Check key limit (max 5 per user)
  const { count } = await admin
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_active', true)

  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      { error: { code: 'LIMIT_REACHED', message: 'Maximum 5 active API keys per account' } },
      { status: 400 }
    )
  }

  const { data: newKey, error } = await admin
    .from('api_keys')
    .insert({
      user_id: user.id,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      name: keyName,
      is_active: true,
    })
    .select('id, key_prefix, name, created_at')
    .single()

  if (error) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    )
  }

  // Return the full key ONCE — it won't be shown again
  return NextResponse.json({
    data: {
      id: newKey.id,
      key: rawKey,
      name: newKey.name,
      created_at: newKey.created_at,
    },
    meta: { warning: 'Save this key now. It will not be shown again.' },
  })
}

// DELETE /api/keys — revoke an API key
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
  const keyId = searchParams.get('id')

  if (!keyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing key id' } },
      { status: 400 }
    )
  }

  const admin = createServerClient()

  // Verify the key belongs to this user
  const { data: existing } = await admin
    .from('api_keys')
    .select('id, user_id')
    .eq('id', keyId)
    .single()

  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'API key not found' } },
      { status: 404 }
    )
  }

  await admin
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', keyId)

  return NextResponse.json({ data: { id: keyId, revoked: true } })
}
