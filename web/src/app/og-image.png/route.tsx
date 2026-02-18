import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #10b981, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '32px',
              fontWeight: 800,
            }}
          >
            AVI
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#f8fafc', fontSize: '48px', fontWeight: 700 }}>
              AI Virality Index
            </span>
          </div>
        </div>
        <div style={{ color: '#94a3b8', fontSize: '24px', maxWidth: '600px', textAlign: 'center' }}>
          The Fear &amp; Greed Index for AI Models
        </div>
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '32px',
          }}
        >
          {['ChatGPT', 'Gemini', 'Claude', 'Perplexity', 'DeepSeek', 'Grok', 'Copilot'].map(
            (name) => (
              <div
                key={name}
                style={{
                  padding: '6px 16px',
                  borderRadius: '20px',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#cbd5e1',
                  fontSize: '16px',
                }}
              >
                {name}
              </div>
            )
          )}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
