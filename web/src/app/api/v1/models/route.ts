import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const revalidate = 3600 // Cache for 1 hour

export async function GET() {
  try {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('models')
      .select('id, slug, name, company, logo_url, color, is_active')
      .eq('is_active', true)
      .order('name')

    if (error) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        data: data ?? [],
        meta: { count: data?.length ?? 0 },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
        },
      }
    )
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
