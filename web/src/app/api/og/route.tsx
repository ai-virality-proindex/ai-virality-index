import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')

  let modelName = 'AI Virality Index'
  let score: number | null = null
  let delta: number | null = null
  let company = ''

  if (slug) {
    try {
      const supabase = createServerClient()

      const { data: model } = await supabase
        .from('models')
        .select('name, company')
        .eq('slug', slug)
        .eq('is_active', true)
        .single()

      if (model) {
        modelName = model.name
        company = model.company || ''
      }

      const { data: score_data } = await supabase
        .from('daily_scores')
        .select('vi_trade, delta7_trade')
        .eq('model_id', slug)
        .order('date', { ascending: false })
        .limit(1)
        .single()

      if (score_data) {
        score = score_data.vi_trade
        delta = score_data.delta7_trade
      }
    } catch {
      // fallback to defaults
    }
  }

  const scoreColor = score
    ? score <= 25 ? '#EF4444'
    : score <= 50 ? '#F59E0B'
    : score <= 75 ? '#EAB308'
    : '#10B981'
    : '#10B981'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Top badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              fontSize: '28px',
              fontWeight: 'bold',
              color: '#10B981',
            }}
          >
            AVI
          </div>
          <div
            style={{
              fontSize: '18px',
              color: '#94A3B8',
            }}
          >
            AI Virality Index
          </div>
        </div>

        {/* Model name */}
        <div
          style={{
            fontSize: slug ? '56px' : '48px',
            fontWeight: 'bold',
            color: 'white',
            marginBottom: '8px',
          }}
        >
          {modelName}
        </div>

        {company && (
          <div
            style={{
              fontSize: '22px',
              color: '#64748B',
              marginBottom: '32px',
            }}
          >
            {company}
          </div>
        )}

        {/* Score display */}
        {score !== null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '16px',
              marginTop: '16px',
            }}
          >
            <div
              style={{
                fontSize: '96px',
                fontWeight: 'bold',
                color: scoreColor,
              }}
            >
              {score.toFixed(1)}
            </div>
            {delta !== null && (
              <div
                style={{
                  fontSize: '32px',
                  fontWeight: 'bold',
                  color: delta >= 0 ? '#10B981' : '#EF4444',
                }}
              >
                {delta >= 0 ? '+' : ''}{delta.toFixed(1)} 7d
              </div>
            )}
          </div>
        )}

        {/* Bottom tagline */}
        <div
          style={{
            fontSize: '18px',
            color: '#475569',
            marginTop: '40px',
          }}
        >
          aiviralityindex.com
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
