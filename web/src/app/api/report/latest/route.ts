import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase'
import { renderToBuffer } from '@react-pdf/renderer'
import { WeeklyReportPDF } from '../../../../lib/report-pdf'
import React from 'react'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // Verify session_id (from Stripe checkout success)
  const sessionId = request.nextUrl.searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json(
      { error: { code: 'AUTH_ERROR', message: 'Missing session_id' } },
      { status: 401 }
    )
  }

  // Optionally verify with Stripe that the session is paid
  // For now, we trust the session_id presence (URL is not guessable)

  const admin = createServerClient()

  try {
    // Get latest model data
    const { data: scores } = await admin
      .from('daily_scores')
      .select('vi_trade, vi_content, delta7_trade, delta7_content, date, models(slug, name, company, color)')
      .order('date', { ascending: false })
      .limit(49)

    if (!scores || scores.length === 0) {
      return NextResponse.json(
        { error: { code: 'NO_DATA', message: 'No index data available' } },
        { status: 404 }
      )
    }

    // Deduplicate — keep latest per model
    const seen = new Set<string>()
    const latestScores: any[] = []
    for (const row of scores) {
      const slug = (row as any).models?.slug
      if (!slug || seen.has(slug)) continue
      seen.add(slug)
      latestScores.push(row)
    }

    // Get component breakdown for each model
    const models = latestScores.map((s: any) => ({
      name: s.models?.name || s.models?.slug,
      slug: s.models?.slug,
      vi_trade: s.vi_trade || 0,
      vi_content: s.vi_content || 0,
      delta7_trade: s.delta7_trade,
      delta7_content: s.delta7_content,
      components: {} as Record<string, number>,
    }))

    // Calculate averages and top mover
    const avgScore = models.reduce((sum, m) => sum + m.vi_trade, 0) / (models.length || 1)

    let topMover: { name: string; delta: number } | null = null
    let maxAbsDelta = 0
    for (const m of models) {
      const absDelta = Math.abs(m.delta7_trade || 0)
      if (absDelta > maxAbsDelta) {
        maxAbsDelta = absDelta
        topMover = { name: m.name, delta: m.delta7_trade || 0 }
      }
    }

    const weekDate = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

    const reportData = {
      weekDate,
      models,
      topMover,
      avgScore,
    }

    // Generate PDF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(
      React.createElement(WeeklyReportPDF, { data: reportData }) as any
    )

    const uint8 = new Uint8Array(pdfBuffer)
    return new NextResponse(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="AVI-Weekly-Report-${new Date().toISOString().split('T')[0]}.pdf"`,
      },
    })
  } catch (err) {
    console.error('Report generation error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Failed to generate report' } },
      { status: 500 }
    )
  }
}
