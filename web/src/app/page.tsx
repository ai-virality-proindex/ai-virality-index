import { createServerClient } from '@/lib/supabase'
import { getIndexColor, getIndexLabel, formatDelta } from '@/lib/utils'
import Link from 'next/link'

// --- Types ---

interface Model {
  slug: string
  name: string
  company: string
  color: string
}

interface DailyScore {
  vi_trade: number
  vi_content: number
  delta7_trade: number | null
  delta7_content: number | null
  date: string
  models: Model
}

// --- Data fetching (server component) ---

async function getTopModels(): Promise<DailyScore[]> {
  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('daily_scores')
      .select('vi_trade, vi_content, delta7_trade, delta7_content, date, models(slug, name, company, color)')
      .order('date', { ascending: false })
      .limit(49) // 7 models × 7 days max

    if (error || !data) return []

    // Deduplicate — keep latest per model
    const seen = new Set<string>()
    const latest: DailyScore[] = []
    for (const row of data as unknown as DailyScore[]) {
      const slug = row.models?.slug
      if (!slug || seen.has(slug)) continue
      seen.add(slug)
      latest.push(row)
    }

    // Sort by vi_trade descending
    return latest.sort((a, b) => (b.vi_trade ?? 0) - (a.vi_trade ?? 0))
  } catch {
    return []
  }
}

// --- Sub-components ---

function MiniGauge({ value }: { value: number }) {
  const color = getIndexColor(value)
  const label = getIndexLabel(value)
  // SVG semi-circle gauge
  const angle = (value / 100) * 180 // 0-180 degrees
  const rad = (angle * Math.PI) / 180
  const cx = 60, cy = 55, r = 45
  const x = cx - r * Math.cos(rad)
  const y = cy - r * Math.sin(rad)
  // Arc path
  const largeArc = angle > 90 ? 1 : 0
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${x.toFixed(1)} ${y.toFixed(1)}`
  const bgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}`

  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="70" viewBox="0 0 120 70">
        {/* Background arc */}
        <path d={bgPath} fill="none" stroke="#334155" strokeWidth="8" strokeLinecap="round" />
        {/* Value arc */}
        <path d={arcPath} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
      </svg>
      <span className="text-3xl font-bold text-white -mt-4">{Math.round(value)}</span>
      <span className="text-xs mt-1" style={{ color }}>{label}</span>
    </div>
  )
}

function ModelRow({ score }: { score: DailyScore }) {
  const m = score.models
  const color = getIndexColor(score.vi_trade)
  const delta = score.delta7_trade
  return (
    <div className="flex items-center justify-between py-3 border-b border-avi-border/50 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ backgroundColor: m.color || '#3B82F6' }}>
          {m.name?.charAt(0)}
        </div>
        <div>
          <span className="font-medium text-white">{m.name}</span>
          <span className="block text-xs text-slate-500">{m.company}</span>
        </div>
      </div>
      <div className="text-right">
        <span className="text-lg font-bold" style={{ color }}>{score.vi_trade?.toFixed(1)}</span>
        {delta != null && (
          <span className={`block text-xs ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatDelta(delta)} 7d
          </span>
        )}
      </div>
    </div>
  )
}

// --- Main Page ---

export const revalidate = 3600 // ISR: revalidate every hour

export default async function Home() {
  const models = await getTopModels()
  const avgScore = models.length > 0
    ? models.reduce((s, m) => s + (m.vi_trade ?? 0), 0) / models.length
    : 50
  const top3 = models.slice(0, 3)

  return (
    <div className="min-h-screen">

      {/* ====== HERO ====== */}
      <section className="relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-avi-dark via-slate-900 to-avi-dark" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.08),transparent_70%)]" />

        <div className="relative mx-auto max-w-5xl px-6 pt-20 pb-24 text-center">
          {/* Mini gauge */}
          <div className="mb-6">
            <MiniGauge value={avgScore} />
            <p className="text-xs text-slate-500 mt-1">Market Average</p>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white mb-4 tracking-tight">
            AI Virality Index
          </h1>
          <p className="text-xl sm:text-2xl text-slate-400 mb-3">
            The Fear &amp; Greed Index for AI Models
          </p>
          <p className="text-slate-500 max-w-2xl mx-auto mb-10 text-base leading-relaxed">
            Real-time composite index (0-100) tracking the virality of ChatGPT, Gemini, Claude,
            DeepSeek, Grok, Perplexity, and Copilot. Powered by 6 data sources,
            updated daily.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/dashboard"
              className="rounded-lg bg-avi-green px-8 py-3.5 font-semibold text-white hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-900/30"
            >
              View Dashboard
            </Link>
            <Link
              href="/docs"
              className="rounded-lg border border-avi-border px-8 py-3.5 font-semibold text-slate-300 hover:border-slate-400 hover:text-white transition-colors"
            >
              API Documentation
            </Link>
          </div>

          {/* Trusted sources strip */}
          <div className="mt-14 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-600">
            <span>Google Trends</span>
            <span className="text-slate-700">|</span>
            <span>YouTube</span>
            <span className="text-slate-700">|</span>
            <span>GitHub</span>
            <span className="text-slate-700">|</span>
            <span>Hacker News</span>
            <span className="text-slate-700">|</span>
            <span>GDELT News</span>
            <span className="text-slate-700">|</span>
            <span>Polymarket</span>
          </div>
        </div>
      </section>

      {/* ====== HOW IT WORKS ====== */}
      <section className="py-20 border-t border-avi-border/50">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-3xl font-bold text-white text-center mb-4">How It Works</h2>
          <p className="text-slate-500 text-center mb-12 max-w-xl mx-auto">
            We aggregate data from multiple sources into a single actionable number.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="rounded-xl bg-avi-card border border-avi-border p-6 text-center hover:border-emerald-800 transition-colors">
              <div className="w-14 h-14 rounded-full bg-emerald-900/40 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-avi-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Track</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                We monitor 7 AI models across Google Trends, YouTube, GitHub, news, and prediction markets every day.
              </p>
            </div>
            {/* Card 2 */}
            <div className="rounded-xl bg-avi-card border border-avi-border p-6 text-center hover:border-blue-800 transition-colors">
              <div className="w-14 h-14 rounded-full bg-blue-900/40 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-avi-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Analyze</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Raw data is normalized, smoothed (EWMA), and combined into a composite 0-100 index using weighted formulas.
              </p>
            </div>
            {/* Card 3 */}
            <div className="rounded-xl bg-avi-card border border-avi-border p-6 text-center hover:border-orange-800 transition-colors">
              <div className="w-14 h-14 rounded-full bg-orange-900/40 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-avi-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.841m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Act</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Get trading signals when index diverges from prediction markets, or find trending topics for content creation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ====== LIVE PREVIEW ====== */}
      <section className="py-20 bg-slate-900/50 border-t border-avi-border/50">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-3xl font-bold text-white text-center mb-4">Live Index</h2>
          <p className="text-slate-500 text-center mb-10">
            Latest virality scores for tracked AI models.
          </p>

          {models.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {models.slice(0, 6).map((score) => {
                const m = score.models
                const color = getIndexColor(score.vi_trade)
                const delta = score.delta7_trade
                return (
                  <div key={m.slug} className="rounded-xl bg-avi-card border border-avi-border p-5 hover:border-slate-500 transition-colors">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ backgroundColor: m.color || '#3B82F6' }}>
                        {m.name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{m.name}</p>
                        <p className="text-xs text-slate-500">{m.company}</p>
                      </div>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-3xl font-bold" style={{ color }}>{score.vi_trade?.toFixed(1)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{getIndexLabel(score.vi_trade)}</p>
                      </div>
                      {delta != null && (
                        <div className={`text-sm font-medium px-2 py-0.5 rounded ${delta >= 0 ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                          {formatDelta(delta)} 7d
                        </div>
                      )}
                    </div>
                    {/* Mini progress bar */}
                    <div className="mt-3 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(score.vi_trade, 100)}%`, backgroundColor: color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl bg-avi-card border border-avi-border p-12 text-center">
              <p className="text-slate-400 mb-2">No live data yet</p>
              <p className="text-sm text-slate-600">Index data will appear after the first daily ETL run.</p>
            </div>
          )}

          <div className="text-center">
            <Link
              href="/dashboard"
              className="text-sm text-avi-green hover:text-emerald-400 transition-colors font-medium"
            >
              View full dashboard &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ====== TWO MODES ====== */}
      <section className="py-20 border-t border-avi-border/50">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-3xl font-bold text-white text-center mb-4">Two Modes, One Index</h2>
          <p className="text-slate-500 text-center mb-12 max-w-xl mx-auto">
            Choose the perspective that matches your goal.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            {/* Trading mode */}
            <div className="rounded-xl bg-avi-card border border-avi-border p-8 hover:border-emerald-700 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-900/40 flex items-center justify-center">
                  <svg className="w-5 h-5 text-avi-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">Trading Mode</h3>
              </div>
              <p className="text-sm text-slate-400 mb-5 leading-relaxed">
                Optimized for Polymarket and Kalshi traders. Catches early attention shifts before odds move.
              </p>
              <div className="space-y-2 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="text-avi-green">&#10003;</span>
                  Momentum breakout signals
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-avi-green">&#10003;</span>
                  Market divergence detection
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-avi-green">&#10003;</span>
                  Quality-backed virality filter
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-avi-green">&#10003;</span>
                  Real-time data (Pro)
                </div>
              </div>
              <div className="mt-6 pt-5 border-t border-avi-border">
                <p className="text-xs text-slate-600 mb-1">Formula weights</p>
                <code className="text-xs text-slate-400">0.20T + 0.20S + 0.15G + 0.10N + 0.20Q + 0.15M</code>
              </div>
            </div>

            {/* Content mode */}
            <div className="rounded-xl bg-avi-card border border-avi-border p-8 hover:border-blue-700 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-blue-900/40 flex items-center justify-center">
                  <svg className="w-5 h-5 text-avi-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">Content Mode</h3>
              </div>
              <p className="text-sm text-slate-400 mb-5 leading-relaxed">
                Built for YouTubers, bloggers, and marketers. Find trending AI topics for maximum audience reach.
              </p>
              <div className="space-y-2 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="text-avi-blue">&#10003;</span>
                  Topic heat scoring
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-avi-blue">&#10003;</span>
                  Social virality emphasis
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-avi-blue">&#10003;</span>
                  News catalyst detection
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-avi-blue">&#10003;</span>
                  Content timing insights
                </div>
              </div>
              <div className="mt-6 pt-5 border-t border-avi-border">
                <p className="text-xs text-slate-600 mb-1">Formula weights</p>
                <code className="text-xs text-slate-400">0.28T + 0.32S + 0.08G + 0.20N + 0.05Q + 0.07M</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== INDEX COMPONENTS ====== */}
      <section className="py-20 bg-slate-900/50 border-t border-avi-border/50">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-3xl font-bold text-white text-center mb-4">6 Data Components</h2>
          <p className="text-slate-500 text-center mb-12 max-w-xl mx-auto">
            Each model&apos;s virality score is built from six normalized signals.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { code: 'T', name: 'Search Interest', desc: 'Google Trends search volume and rising queries', color: '#10B981' },
              { code: 'S', name: 'Social Buzz', desc: 'YouTube videos, views, engagement + Hacker News discussion', color: '#3B82F6' },
              { code: 'G', name: 'Developer Adoption', desc: 'GitHub stars, forks velocity, issue activity', color: '#8B5CF6' },
              { code: 'N', name: 'News Coverage', desc: 'GDELT global news mentions count and sentiment', color: '#F59E0B' },
              { code: 'Q', name: 'Quality Score', desc: 'Arena Elo rating from head-to-head model comparisons', color: '#EC4899' },
              { code: 'M', name: 'Market Conviction', desc: 'Polymarket prediction odds and trading volume', color: '#EF4444' },
            ].map((c) => (
              <div key={c.code} className="rounded-lg bg-avi-card border border-avi-border p-5 flex gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold text-white text-lg"
                  style={{ backgroundColor: c.color + '25', color: c.color }}>
                  {c.code}
                </div>
                <div>
                  <p className="font-medium text-white text-sm">{c.name}</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====== PRICING ====== */}
      <section className="py-20 border-t border-avi-border/50" id="pricing">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-3xl font-bold text-white text-center mb-4">Pricing</h2>
          <p className="text-slate-500 text-center mb-12">
            Start free. Upgrade when you need real-time data and signals.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {/* Free */}
            <div className="rounded-xl bg-avi-card border border-avi-border p-7">
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Free</p>
              <p className="text-4xl font-bold text-white mb-1">$0</p>
              <p className="text-sm text-slate-500 mb-6">Forever</p>
              <ul className="space-y-3 text-sm text-slate-400 mb-8">
                <li className="flex gap-2"><span className="text-slate-600">&#10003;</span> Current index (1-3 day delay)</li>
                <li className="flex gap-2"><span className="text-slate-600">&#10003;</span> 90-day chart history</li>
                <li className="flex gap-2"><span className="text-slate-600">&#10003;</span> All 7 models</li>
                <li className="flex gap-2"><span className="text-slate-600">&#10003;</span> Basic API (60 req/min)</li>
              </ul>
              <Link href="/dashboard" className="block w-full rounded-lg border border-avi-border py-2.5 text-center text-sm font-medium text-slate-300 hover:border-slate-400 transition-colors">
                Get Started
              </Link>
            </div>

            {/* Pro Trader */}
            <div className="rounded-xl bg-avi-card border-2 border-avi-green p-7 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-avi-green text-white text-xs font-semibold px-3 py-1 rounded-full">
                Most Popular
              </div>
              <p className="text-sm font-semibold text-avi-green uppercase tracking-wider mb-2">Pro Trader</p>
              <p className="text-4xl font-bold text-white mb-1">$29<span className="text-lg text-slate-500 font-normal">/mo</span></p>
              <p className="text-sm text-slate-500 mb-6">For prediction market traders</p>
              <ul className="space-y-3 text-sm text-slate-400 mb-8">
                <li className="flex gap-2"><span className="text-avi-green">&#10003;</span> Real-time data (no delay)</li>
                <li className="flex gap-2"><span className="text-avi-green">&#10003;</span> Full history</li>
                <li className="flex gap-2"><span className="text-avi-green">&#10003;</span> Component breakdown (T/S/G/N/Q/M)</li>
                <li className="flex gap-2"><span className="text-avi-green">&#10003;</span> Trading signals + alerts</li>
                <li className="flex gap-2"><span className="text-avi-green">&#10003;</span> API 600 req/min</li>
              </ul>
              <Link href="/pricing" className="block w-full rounded-lg bg-avi-green py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-600 transition-colors">
                Subscribe
              </Link>
            </div>

            {/* Pro Builder */}
            <div className="rounded-xl bg-avi-card border border-avi-border p-7">
              <p className="text-sm font-semibold text-avi-blue uppercase tracking-wider mb-2">Pro Builder</p>
              <p className="text-4xl font-bold text-white mb-1">$99<span className="text-lg text-slate-500 font-normal">/mo</span></p>
              <p className="text-sm text-slate-500 mb-6">For devs and teams</p>
              <ul className="space-y-3 text-sm text-slate-400 mb-8">
                <li className="flex gap-2"><span className="text-avi-blue">&#10003;</span> Everything in Pro Trader</li>
                <li className="flex gap-2"><span className="text-avi-blue">&#10003;</span> API 3,000 req/min</li>
                <li className="flex gap-2"><span className="text-avi-blue">&#10003;</span> Webhook alerts</li>
                <li className="flex gap-2"><span className="text-avi-blue">&#10003;</span> CSV export</li>
                <li className="flex gap-2"><span className="text-avi-blue">&#10003;</span> Priority support</li>
              </ul>
              <Link href="/pricing" className="block w-full rounded-lg border border-avi-border py-2.5 text-center text-sm font-medium text-slate-300 hover:border-slate-400 transition-colors">
                Subscribe
              </Link>
            </div>
          </div>
          <p className="text-center text-xs text-slate-600 mt-6">
            Enterprise plans from $499/mo &mdash; custom indices, SLA, white-label. <Link href="/pricing" className="text-slate-500 hover:text-slate-400 underline">Contact us</Link>
          </p>
        </div>
      </section>

      {/* ====== CTA ====== */}
      <section className="py-20 bg-gradient-to-r from-emerald-900/20 to-blue-900/20 border-t border-avi-border/50">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Start Tracking AI Virality</h2>
          <p className="text-slate-400 mb-8 max-w-lg mx-auto">
            Free dashboard, public API, no credit card required. See which AI models are gaining momentum right now.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/dashboard"
              className="rounded-lg bg-avi-green px-10 py-3.5 font-semibold text-white hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-900/30"
            >
              Open Dashboard
            </Link>
            <Link
              href="/docs"
              className="rounded-lg border border-avi-border px-10 py-3.5 font-semibold text-slate-300 hover:border-slate-400 hover:text-white transition-colors"
            >
              Read API Docs
            </Link>
          </div>
        </div>
      </section>

      {/* ====== FOOTER ====== */}
      <footer className="border-t border-avi-border py-12">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid sm:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="sm:col-span-2">
              <p className="text-xl font-bold text-white mb-2">AI Virality Index</p>
              <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
                The Fear &amp; Greed Index for AI models. Track virality, catch momentum shifts, and make better decisions.
              </p>
            </div>
            {/* Product */}
            <div>
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Product</p>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><Link href="/dashboard" className="hover:text-slate-300 transition-colors">Dashboard</Link></li>
                <li><Link href="/pricing" className="hover:text-slate-300 transition-colors">Pricing</Link></li>
                <li><Link href="/docs" className="hover:text-slate-300 transition-colors">API Docs</Link></li>
              </ul>
            </div>
            {/* Models */}
            <div>
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Models</p>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><Link href="/models/chatgpt" className="hover:text-slate-300 transition-colors">ChatGPT</Link></li>
                <li><Link href="/models/gemini" className="hover:text-slate-300 transition-colors">Gemini</Link></li>
                <li><Link href="/models/claude" className="hover:text-slate-300 transition-colors">Claude</Link></li>
                <li><Link href="/models/deepseek" className="hover:text-slate-300 transition-colors">DeepSeek</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-avi-border pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-slate-600">&copy; {new Date().getFullYear()} AI Virality Index. All rights reserved.</p>
            <div className="flex gap-4 text-xs text-slate-600">
              <Link href="/docs" className="hover:text-slate-400 transition-colors">API</Link>
              <Link href="/pricing" className="hover:text-slate-400 transition-colors">Pricing</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
