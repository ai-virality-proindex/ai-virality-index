'use client'

import { useState, useCallback } from 'react'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  return (
    <div className="relative group">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{lang}</div>
      <pre className="bg-slate-950 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto border border-avi-border leading-relaxed">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  )
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-xl font-bold text-white mt-12 mb-4 scroll-mt-20">
      {children}
    </h2>
  )
}

function EndpointCard({
  method,
  path,
  tier,
  description,
  params,
  response,
  examples,
}: {
  method: string
  path: string
  tier: 'Free' | 'Pro'
  description: string
  params?: { name: string; type: string; required: boolean; description: string }[]
  response: string
  examples: { lang: string; code: string }[]
}) {
  const [tab, setTab] = useState(0)

  return (
    <div className="rounded-xl bg-avi-card border border-avi-border p-5 mb-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="px-2 py-0.5 text-xs font-bold rounded bg-emerald-900/40 text-emerald-400">
          {method}
        </span>
        <code className="text-sm font-mono text-white">{path}</code>
        <span
          className={`ml-auto px-2 py-0.5 text-xs font-semibold rounded ${
            tier === 'Free'
              ? 'bg-slate-700 text-slate-300'
              : 'bg-blue-900/40 text-blue-400'
          }`}
        >
          {tier}
        </span>
      </div>
      <p className="text-sm text-slate-400 mb-4">{description}</p>

      {params && params.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-2">Parameters</h4>
          <div className="border border-avi-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/50 text-left">
                  <th className="px-3 py-2 text-slate-400 font-medium">Name</th>
                  <th className="px-3 py-2 text-slate-400 font-medium">Type</th>
                  <th className="px-3 py-2 text-slate-400 font-medium">Required</th>
                  <th className="px-3 py-2 text-slate-400 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {params.map((p) => (
                  <tr key={p.name} className="border-t border-avi-border">
                    <td className="px-3 py-2 font-mono text-emerald-400 text-xs">{p.name}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{p.type}</td>
                    <td className="px-3 py-2 text-xs">
                      {p.required ? (
                        <span className="text-amber-400">Yes</span>
                      ) : (
                        <span className="text-slate-500">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-300 text-xs">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-2">Response</h4>
      <div className="relative mb-4">
        <pre className="bg-slate-950 rounded-lg p-4 text-xs text-slate-300 overflow-x-auto border border-avi-border leading-relaxed">
          <code>{response}</code>
        </pre>
      </div>

      <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-2">Examples</h4>
      <div className="flex gap-1 mb-2">
        {examples.map((ex, i) => (
          <button
            key={ex.lang}
            onClick={() => setTab(i)}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              tab === i
                ? 'bg-slate-700 text-white'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {ex.lang}
          </button>
        ))}
      </div>
      <CodeBlock code={examples[tab].code} lang={examples[tab].lang} />
    </div>
  )
}

const NAV_ITEMS = [
  { id: 'auth', label: 'Authentication' },
  { id: 'rate-limits', label: 'Rate Limits' },
  { id: 'endpoints', label: 'Endpoints' },
  { id: 'responses', label: 'Response Format' },
  { id: 'errors', label: 'Error Codes' },
]

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <div className="flex gap-8">
        {/* Sidebar nav */}
        <nav className="hidden lg:block w-48 shrink-0 sticky top-8 self-start">
          <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3">On this page</h3>
          <ul className="space-y-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-white mb-2">API Documentation</h1>
          <p className="text-slate-400 mb-8">
            Access real-time AI model virality data. Free tier includes 3 endpoints with 1-day delay.
            Pro unlocks component breakdowns, signals, and model comparison with real-time data.
          </p>

          <div className="rounded-lg bg-blue-950/30 border border-blue-800/40 p-4 mb-8 text-sm">
            <p className="text-blue-300">
              <strong>Base URL:</strong>{' '}
              <code className="bg-slate-800 px-2 py-0.5 rounded text-blue-200">
                https://aiviralityindex.com/api/v1
              </code>
            </p>
          </div>

          {/* Auth */}
          <SectionHeading id="auth">Authentication</SectionHeading>
          <div className="text-sm text-slate-300 space-y-3 mb-6">
            <p>
              Free endpoints require no authentication. Pro endpoints require an API key passed in the
              Authorization header.
            </p>
            <CodeBlock
              code={`Authorization: Bearer avi_pk_your_api_key_here`}
              lang="Header"
            />
            <p className="text-slate-400">
              Generate API keys in your{' '}
              <a href="/dashboard/keys" className="text-blue-400 hover:underline">
                Dashboard
              </a>
              . Keys start with <code className="text-emerald-400">avi_pk_</code>.
            </p>
          </div>

          {/* Rate Limits */}
          <SectionHeading id="rate-limits">Rate Limits</SectionHeading>
          <div className="mb-6">
            <div className="border border-avi-border rounded-lg overflow-hidden text-sm">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-800/50 text-left">
                    <th className="px-4 py-2 text-slate-400 font-medium">Plan</th>
                    <th className="px-4 py-2 text-slate-400 font-medium">Limit</th>
                    <th className="px-4 py-2 text-slate-400 font-medium">Identifier</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-avi-border">
                    <td className="px-4 py-2 text-slate-300">Free</td>
                    <td className="px-4 py-2 text-slate-300">60 requests/min</td>
                    <td className="px-4 py-2 text-slate-400">IP address</td>
                  </tr>
                  <tr className="border-t border-avi-border">
                    <td className="px-4 py-2 text-slate-300">Pro</td>
                    <td className="px-4 py-2 text-slate-300">600 requests/min</td>
                    <td className="px-4 py-2 text-slate-400">API key</td>
                  </tr>
                  <tr className="border-t border-avi-border">
                    <td className="px-4 py-2 text-slate-300">Enterprise</td>
                    <td className="px-4 py-2 text-slate-300">3,000 requests/min</td>
                    <td className="px-4 py-2 text-slate-400">API key</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Rate limit info is returned in headers: <code>X-RateLimit-Limit</code>,{' '}
              <code>X-RateLimit-Remaining</code>, <code>X-RateLimit-Reset</code>.
              On 429 responses, check <code>Retry-After</code> header.
            </p>
          </div>

          {/* Endpoints */}
          <SectionHeading id="endpoints">Endpoints</SectionHeading>

          <h3 className="text-lg font-semibold text-white mt-6 mb-3">Free Endpoints</h3>

          <EndpointCard
            method="GET"
            path="/api/v1/models"
            tier="Free"
            description="List all active AI models with metadata."
            response={`{
  "data": [
    {
      "slug": "chatgpt",
      "name": "ChatGPT",
      "company": "OpenAI",
      "color": "#10a981"
    }
  ],
  "meta": { "count": 7 }
}`}
            examples={[
              {
                lang: 'curl',
                code: `curl https://aiviralityindex.com/api/v1/models`,
              },
              {
                lang: 'Python',
                code: `import requests

resp = requests.get("https://aiviralityindex.com/api/v1/models")
models = resp.json()["data"]
for m in models:
    print(f"{m['name']} ({m['slug']})")`,
              },
              {
                lang: 'JavaScript',
                code: `const res = await fetch("https://aiviralityindex.com/api/v1/models");
const { data } = await res.json();
console.log(data);`,
              },
            ]}
          />

          <EndpointCard
            method="GET"
            path="/api/v1/index/latest"
            tier="Free"
            description="Get latest virality index scores for all models (1-day delay on free tier)."
            params={[
              {
                name: 'model',
                type: 'string',
                required: false,
                description: 'Filter by model slug (e.g. chatgpt)',
              },
            ]}
            response={`{
  "data": [
    {
      "model": "chatgpt",
      "name": "ChatGPT",
      "date": "2026-02-16",
      "vi_trade": 72.5,
      "vi_content": 65.3,
      "delta7_trade": 4.2,
      "delta7_content": -1.8
    }
  ],
  "meta": {
    "count": 7,
    "date": "2026-02-16",
    "delayed": true
  }
}`}
            examples={[
              {
                lang: 'curl',
                code: `curl "https://aiviralityindex.com/api/v1/index/latest"

# Single model
curl "https://aiviralityindex.com/api/v1/index/latest?model=chatgpt"`,
              },
              {
                lang: 'Python',
                code: `import requests

# All models
resp = requests.get("https://aiviralityindex.com/api/v1/index/latest")
for m in resp.json()["data"]:
    print(f"{m['name']}: {m['vi_trade']:.1f}")

# Single model
resp = requests.get(
    "https://aiviralityindex.com/api/v1/index/latest",
    params={"model": "chatgpt"}
)
print(resp.json()["data"])`,
              },
              {
                lang: 'JavaScript',
                code: `// All models
const res = await fetch("https://aiviralityindex.com/api/v1/index/latest");
const { data, meta } = await res.json();
console.log(\`Date: \${meta.date}, Models: \${meta.count}\`);

// Single model
const single = await fetch(
  "https://aiviralityindex.com/api/v1/index/latest?model=chatgpt"
);
console.log(await single.json());`,
              },
            ]}
          />

          <EndpointCard
            method="GET"
            path="/api/v1/index/history"
            tier="Free"
            description="Get historical virality scores for a specific model over N days."
            params={[
              {
                name: 'model',
                type: 'string',
                required: true,
                description: 'Model slug (e.g. claude)',
              },
              {
                name: 'days',
                type: 'integer',
                required: false,
                description: 'Number of days (1-90, default 30)',
              },
            ]}
            response={`{
  "data": [
    {
      "date": "2026-01-18",
      "vi_trade": 68.2,
      "vi_content": 61.5,
      "delta7_trade": 3.1,
      "delta7_content": 2.4
    }
  ],
  "meta": {
    "model": "claude",
    "name": "Claude",
    "from": "2026-01-18",
    "to": "2026-02-16",
    "days": 30,
    "count": 30
  }
}`}
            examples={[
              {
                lang: 'curl',
                code: `curl "https://aiviralityindex.com/api/v1/index/history?model=claude&days=30"`,
              },
              {
                lang: 'Python',
                code: `import requests

resp = requests.get(
    "https://aiviralityindex.com/api/v1/index/history",
    params={"model": "claude", "days": 90}
)
history = resp.json()["data"]
print(f"Got {len(history)} days of data")`,
              },
              {
                lang: 'JavaScript',
                code: `const res = await fetch(
  "https://aiviralityindex.com/api/v1/index/history?model=claude&days=30"
);
const { data, meta } = await res.json();
console.log(\`\${meta.name}: \${meta.from} to \${meta.to}\`);`,
              },
            ]}
          />

          <h3 className="text-lg font-semibold text-white mt-8 mb-3">Pro Endpoints</h3>
          <p className="text-sm text-slate-400 mb-4">
            Require <code className="text-emerald-400">Authorization: Bearer avi_pk_...</code> header.
            Real-time data, no delay.
          </p>

          <EndpointCard
            method="GET"
            path="/api/v1/breakdown"
            tier="Pro"
            description="Get the 6-component breakdown (T, S, G, N, Q, M) for a model's virality score."
            params={[
              {
                name: 'model',
                type: 'string',
                required: true,
                description: 'Model slug',
              },
              {
                name: 'date',
                type: 'string',
                required: false,
                description: 'YYYY-MM-DD format (default: today)',
              },
            ]}
            response={`{
  "data": {
    "model": "chatgpt",
    "name": "ChatGPT",
    "date": "2026-02-17",
    "vi_trade": 72.5,
    "vi_content": 65.3,
    "components": [
      { "component": "T", "label": "Trends", "normalized": 0.68, "smoothed": 0.69 },
      { "component": "S", "label": "Social", "normalized": 0.54, "smoothed": 0.55 },
      { "component": "G", "label": "GitHub", "normalized": 0.42, "smoothed": 0.42 },
      { "component": "N", "label": "News",   "normalized": 0.72, "smoothed": 0.71 },
      { "component": "Q", "label": "Quality","normalized": 0.94, "smoothed": 0.94 },
      { "component": "M", "label": "Market", "normalized": 0.89, "smoothed": 0.89 }
    ]
  },
  "meta": { "date": "2026-02-17", "component_count": 6 }
}`}
            examples={[
              {
                lang: 'curl',
                code: `curl -H "Authorization: Bearer avi_pk_your_key" \\
  "https://aiviralityindex.com/api/v1/breakdown?model=chatgpt"`,
              },
              {
                lang: 'Python',
                code: `import requests

headers = {"Authorization": "Bearer avi_pk_your_key"}
resp = requests.get(
    "https://aiviralityindex.com/api/v1/breakdown",
    params={"model": "chatgpt"},
    headers=headers
)
for c in resp.json()["data"]["components"]:
    print(f"{c['label']}: {c['normalized']:.2f}")`,
              },
              {
                lang: 'JavaScript',
                code: `const res = await fetch(
  "https://aiviralityindex.com/api/v1/breakdown?model=chatgpt",
  { headers: { Authorization: "Bearer avi_pk_your_key" } }
);
const { data } = await res.json();
data.components.forEach(c =>
  console.log(\`\${c.label}: \${c.normalized}\`)
);`,
              },
            ]}
          />

          <EndpointCard
            method="GET"
            path="/api/v1/signals"
            tier="Pro"
            description="Get trading signals (divergence, momentum, sentiment shifts) for AI models."
            params={[
              {
                name: 'model',
                type: 'string',
                required: false,
                description: 'Filter by model slug',
              },
              {
                name: 'active',
                type: 'boolean',
                required: false,
                description: 'Show only active signals (default: true)',
              },
            ]}
            response={`{
  "data": [
    {
      "model": "chatgpt",
      "name": "ChatGPT",
      "date": "2026-02-17",
      "signal_type": "divergence",
      "direction": "bullish",
      "strength": 85,
      "reasoning": "VI rising while Polymarket odds stable",
      "expires_at": "2026-02-24"
    }
  ],
  "meta": { "count": 3, "active_only": true }
}`}
            examples={[
              {
                lang: 'curl',
                code: `curl -H "Authorization: Bearer avi_pk_your_key" \\
  "https://aiviralityindex.com/api/v1/signals?model=chatgpt"`,
              },
              {
                lang: 'Python',
                code: `import requests

headers = {"Authorization": "Bearer avi_pk_your_key"}
resp = requests.get(
    "https://aiviralityindex.com/api/v1/signals",
    params={"active": "true"},
    headers=headers
)
for s in resp.json()["data"]:
    print(f"{s['model']}: {s['signal_type']} {s['direction']} ({s['strength']})")`,
              },
              {
                lang: 'JavaScript',
                code: `const res = await fetch(
  "https://aiviralityindex.com/api/v1/signals?active=true",
  { headers: { Authorization: "Bearer avi_pk_your_key" } }
);
const { data } = await res.json();
data.forEach(s =>
  console.log(\`\${s.model}: \${s.signal_type} \${s.direction}\`)
);`,
              },
            ]}
          />

          <EndpointCard
            method="GET"
            path="/api/v1/compare"
            tier="Pro"
            description="Compare virality scores across 2-7 models over time."
            params={[
              {
                name: 'models',
                type: 'string',
                required: true,
                description: 'Comma-separated slugs (e.g. chatgpt,gemini,claude)',
              },
              {
                name: 'days',
                type: 'integer',
                required: false,
                description: 'Comparison window (1-365, default 30)',
              },
            ]}
            response={`{
  "data": [
    {
      "model": "chatgpt",
      "name": "ChatGPT",
      "color": "#10a981",
      "series": [
        { "date": "2026-01-18", "vi_trade": 70.2, "vi_content": 65.1 }
      ]
    },
    {
      "model": "gemini",
      "name": "Gemini",
      "color": "#3b82f6",
      "series": [...]
    }
  ],
  "meta": {
    "models": ["chatgpt", "gemini"],
    "from": "2026-01-18",
    "to": "2026-02-17",
    "days": 30
  }
}`}
            examples={[
              {
                lang: 'curl',
                code: `curl -H "Authorization: Bearer avi_pk_your_key" \\
  "https://aiviralityindex.com/api/v1/compare?models=chatgpt,gemini,claude&days=30"`,
              },
              {
                lang: 'Python',
                code: `import requests

headers = {"Authorization": "Bearer avi_pk_your_key"}
resp = requests.get(
    "https://aiviralityindex.com/api/v1/compare",
    params={"models": "chatgpt,gemini,claude", "days": 30},
    headers=headers
)
for model in resp.json()["data"]:
    latest = model["series"][-1]
    print(f"{model['name']}: {latest['vi_trade']:.1f}")`,
              },
              {
                lang: 'JavaScript',
                code: `const res = await fetch(
  "https://aiviralityindex.com/api/v1/compare?models=chatgpt,gemini,claude&days=30",
  { headers: { Authorization: "Bearer avi_pk_your_key" } }
);
const { data } = await res.json();
data.forEach(m =>
  console.log(\`\${m.name}: \${m.series.length} days\`)
);`,
              },
            ]}
          />

          {/* Response Format */}
          <SectionHeading id="responses">Response Format</SectionHeading>
          <div className="text-sm text-slate-300 space-y-3 mb-6">
            <p>All endpoints return JSON with a consistent structure.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-2">Success (2xx)</h4>
                <CodeBlock
                  code={`{
  "data": { ... },
  "meta": {
    "count": 7,
    "date": "2026-02-17"
  }
}`}
                  lang="JSON"
                />
              </div>
              <div>
                <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-2">Error (4xx/5xx)</h4>
                <CodeBlock
                  code={`{
  "error": {
    "code": "NOT_FOUND",
    "message": "Model not found: xyz"
  }
}`}
                  lang="JSON"
                />
              </div>
            </div>
          </div>

          {/* Errors */}
          <SectionHeading id="errors">Error Codes</SectionHeading>
          <div className="border border-avi-border rounded-lg overflow-hidden text-sm mb-12">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-800/50 text-left">
                  <th className="px-4 py-2 text-slate-400 font-medium">Code</th>
                  <th className="px-4 py-2 text-slate-400 font-medium">HTTP</th>
                  <th className="px-4 py-2 text-slate-400 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['VALIDATION_ERROR', '400', 'Invalid query parameters or request body'],
                  ['UNAUTHORIZED', '401', 'Missing or invalid API key'],
                  ['FORBIDDEN', '403', 'Endpoint requires a higher plan'],
                  ['NOT_FOUND', '404', 'Model or resource not found'],
                  ['RATE_LIMITED', '429', 'Rate limit exceeded — check Retry-After header'],
                  ['DB_ERROR', '500', 'Database query failed'],
                  ['INTERNAL_ERROR', '500', 'Unexpected server error'],
                ].map(([code, http, desc]) => (
                  <tr key={code} className="border-t border-avi-border">
                    <td className="px-4 py-2 font-mono text-xs text-amber-400">{code}</td>
                    <td className="px-4 py-2 text-slate-300">{http}</td>
                    <td className="px-4 py-2 text-slate-400">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
