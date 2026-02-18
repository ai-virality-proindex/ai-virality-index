'use client'

import { useState, useMemo } from 'react'
import CompareChart from './CompareChart'
import ModeToggle from './ModeToggle'
import { getIndexColor, formatDelta } from '@/lib/utils'

interface ModelInfo {
  slug: string
  name: string
  company: string
  color: string
}

interface HistoryPoint {
  date: string
  vi_trade: number
  vi_content: number
}

interface CompareViewProps {
  models: ModelInfo[]
  historyMap: Record<string, HistoryPoint[]>
  latestMap: Record<string, {
    vi_trade: number
    vi_content: number
    delta7_trade: number | null
    delta7_content: number | null
  }>
}

export default function CompareView({ models, historyMap, latestMap }: CompareViewProps) {
  const [mode, setMode] = useState<'trade' | 'content'>('trade')
  const [selected, setSelected] = useState<string[]>(
    models.slice(0, 3).map((m) => m.slug)
  )

  const toggleModel = (slug: string) => {
    setSelected((prev) => {
      if (prev.includes(slug)) {
        return prev.filter((s) => s !== slug)
      }
      if (prev.length >= 4) return prev // max 4
      return [...prev, slug]
    })
  }

  // Build series for selected models
  const series = useMemo(() => {
    return selected
      .map((slug) => {
        const model = models.find((m) => m.slug === slug)
        if (!model) return null
        return {
          model: slug,
          name: model.name,
          color: model.color,
          data: historyMap[slug] || [],
        }
      })
      .filter(Boolean) as { model: string; name: string; color: string; data: HistoryPoint[] }[]
  }, [selected, models, historyMap])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Compare Models</h1>
          <p className="text-sm text-slate-500 mt-1">Select 2-4 models to compare</p>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {/* Model selector */}
      <div className="flex flex-wrap gap-2">
        {models.map((m) => {
          const isSelected = selected.includes(m.slug)
          return (
            <button
              key={m.slug}
              onClick={() => toggleModel(m.slug)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                isSelected
                  ? 'border-slate-500 bg-slate-800 text-white'
                  : 'border-avi-border bg-avi-card text-slate-400 hover:border-slate-500'
              }`}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: isSelected ? m.color || '#3B82F6' : '#475569' }}
              >
                {m.name?.charAt(0)}
              </div>
              {m.name}
              {isSelected && (
                <span className="text-xs text-slate-500 ml-1">✓</span>
              )}
            </button>
          )
        })}
      </div>

      {selected.length < 2 && (
        <div className="rounded-xl bg-avi-card border border-avi-border p-8 text-center">
          <p className="text-slate-500">Select at least 2 models to compare.</p>
        </div>
      )}

      {selected.length >= 2 && (
        <>
          {/* Chart */}
          <CompareChart series={series} mode={mode} />

          {/* Comparison table */}
          <div className="rounded-xl bg-avi-card border border-avi-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-avi-border">
                    <th className="text-left text-xs text-slate-500 uppercase tracking-wider p-4">
                      Metric
                    </th>
                    {selected.map((slug) => {
                      const m = models.find((x) => x.slug === slug)
                      return (
                        <th key={slug} className="text-center p-4">
                          <div className="flex items-center justify-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: m?.color || '#3B82F6' }}
                            />
                            <span className="text-white font-medium text-xs">
                              {m?.name || slug}
                            </span>
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* Trading Index */}
                  <tr className="border-b border-avi-border/50">
                    <td className="p-4 text-slate-400">Trading Index</td>
                    {selected.map((slug) => {
                      const latest = latestMap[slug]
                      const val = latest?.vi_trade
                      return (
                        <td key={slug} className="p-4 text-center">
                          <span className="text-lg font-bold" style={{ color: val ? getIndexColor(val) : undefined }}>
                            {val?.toFixed(1) ?? '—'}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                  {/* Content Index */}
                  <tr className="border-b border-avi-border/50">
                    <td className="p-4 text-slate-400">Content Index</td>
                    {selected.map((slug) => {
                      const latest = latestMap[slug]
                      const val = latest?.vi_content
                      return (
                        <td key={slug} className="p-4 text-center">
                          <span className="text-lg font-bold" style={{ color: val ? getIndexColor(val) : undefined }}>
                            {val?.toFixed(1) ?? '—'}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                  {/* 7d Change (Trading) */}
                  <tr className="border-b border-avi-border/50">
                    <td className="p-4 text-slate-400">7d Change (Trade)</td>
                    {selected.map((slug) => {
                      const latest = latestMap[slug]
                      const d = latest?.delta7_trade
                      return (
                        <td key={slug} className="p-4 text-center">
                          {d != null ? (
                            <span className={`font-medium ${d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatDelta(d)}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                  {/* 7d Change (Content) */}
                  <tr>
                    <td className="p-4 text-slate-400">7d Change (Content)</td>
                    {selected.map((slug) => {
                      const latest = latestMap[slug]
                      const d = latest?.delta7_content
                      return (
                        <td key={slug} className="p-4 text-center">
                          {d != null ? (
                            <span className={`font-medium ${d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatDelta(d)}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
