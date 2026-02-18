# AI Virality Index (AVI) — Technical Specification v1.0

> Unified specification synthesized from three research documents.
> Last updated: 2026-02-15

---

## 1. Product Definition

### 1.1 What is AVI?

AI Virality Index — composite real-time index (0-100) measuring the **virality** of AI models as products/brands. Not quality, not benchmarks — **attention + adoption + credibility + catalysts**.

Tracked models (MVP): ChatGPT, Gemini, Claude, Perplexity, DeepSeek, Grok, Copilot.

### 1.2 Two Modes

| Mode | Target Audience | Goal |
|------|----------------|------|
| **Trading** | Polymarket/Kalshi traders | Catch early attention shifts before odds move |
| **Content/Marketing** | YouTubers, bloggers, marketers | Find trending topics for maximum reach |

### 1.3 Market Gap

No existing product provides a **model-specific, real-time, 0-100 virality index**.

| Existing Product | What it measures | Why it's not AVI |
|---|---|---|
| LMSYS Chatbot Arena | Quality (Elo from battles) | Not virality, no 0-100 scale |
| Artificial Analysis | Quality (composite evals) | Intelligence, not attention |
| a16z Top 100 GenAI | App traffic/popularity | Products, not models; no index |
| AI Fear & Greed Index | General AI sentiment | Not model-specific |
| Kaito AI | Crypto + AI narratives | B2B institutional, expensive |
| SimilarWeb | Website traffic | Lagging indicator, not actionable |
| Stanford AI Index | Annual AI landscape | Annual report, not real-time |

AVI's unique position: **model-level virality + trading mode + public API + market divergence signals**.

---

## 2. Mathematical Model

### 2.1 Signals (Data Sources)

| Signal | Code | Source | API | Free Tier Limits |
|--------|------|--------|-----|-----------------|
| Search Interest | T | Google Trends | pytrends (unofficial) | No hard limit, rate-limit ~10 req/min |
| Social/Video | S | YouTube Data API | Official v3 | 10,000 units/day |
| Social/Discussion | S | Reddit (PRAW) | Official | 60 req/min with OAuth |
| Developer Adoption | G | GitHub | REST/GraphQL API | 5,000 req/hour (authenticated) |
| News/Media | N | GDELT | DOC API (open) | No hard limit, be polite |
| Dev Adoption | D | npm + PyPI SDK downloads | Registry APIs | Public, no auth needed |
| Mindshare | M | Wikipedia pageviews | Wikimedia REST API | Public, no auth needed |

**Excluded from MVP:** X/Twitter (API too expensive/restricted). Reddit + HN serve as social discussion proxy.

### 2.2 Model Aliases Dictionary

```yaml
chatgpt:
  queries: ["ChatGPT", "GPT-4", "GPT-4o", "GPT-5", "OpenAI ChatGPT"]
  github_repos: ["openai/openai-python", "openai/openai-node"]
  subreddit: "ChatGPT"

gemini:
  queries: ["Gemini AI", "Google Gemini", "Gemini 2", "Gemini 3"]
  github_repos: ["google/generative-ai-python", "google/generative-ai-js"]
  subreddit: "Bard" # historical, may change

claude:
  queries: ["Claude AI", "Claude 4", "Anthropic Claude"]
  github_repos: ["anthropics/anthropic-sdk-python", "anthropics/anthropic-sdk-typescript"]
  subreddit: "ClaudeAI"

perplexity:
  queries: ["Perplexity AI", "Perplexity"]
  github_repos: [] # closed source
  subreddit: "perplexity_ai"

deepseek:
  queries: ["DeepSeek", "DeepSeek R1", "DeepSeek V3"]
  github_repos: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1"]
  subreddit: "DeepSeek"

grok:
  queries: ["Grok AI", "xAI Grok", "Grok 3"]
  github_repos: ["xai-org/grok-1"]
  subreddit: "grok"

copilot:
  queries: ["GitHub Copilot", "Microsoft Copilot"]
  github_repos: [] # closed source
  subreddit: "MicrosoftCopilot"
```

### 2.3 Normalized Components (0-100)

For each model `m` on day `t`:

| Component | Code | What it captures |
|-----------|------|-----------------|
| Trends Score | T(m,t) | Google Trends interest + rising queries |
| Social Score | S(m,t) | YouTube videos/views/engagement + Reddit posts/comments |
| GitHub Score | G(m,t) | Stars/forks velocity, issue activity |
| News Score | N(m,t) | GDELT mentions count + sentiment |
| Quality Score | Q(m,t) | Arena Elo rank + AA Intelligence Index |
| Market Score | M(m,t) | Polymarket odds + volume (when available) |

### 2.4 Normalization: Rolling Quantile Scaling

For any raw metric `x(t)`:

```
1. Compute q05, q95 on a 90-day rolling window
2. Winsorize: x'(t) = clip(x(t), q05, q95)
3. Scale: score(t) = 100 * (x'(t) - q05) / (q95 - q05)
```

**Why this approach:**
- Min-Max: one super-spike ruins the scale for months. Rejected.
- Z-Score + Sigmoid: good but requires tuning parameters k, b. Backup option.
- Quantile q05/q95: **robust**, no parameter tuning, outlier-resistant. **Primary choice.**

### 2.5 Smoothing: EWMA

```
EWMA(t) = alpha * x(t) + (1 - alpha) * EWMA(t-1)
```

| Mode | Alpha | Rationale |
|------|-------|-----------|
| Trading | 0.35 | Faster response to changes |
| Content | 0.25 | Smoother, marketing-friendly |

Public chart line: 7-day moving average (visually clearer).

### 2.6 Index Formulas

#### Mode 1: Trading Index

```
VI_trade(m,t) = 0.18*T + 0.28*S + 0.15*G + 0.12*N + 0.15*D + 0.12*M
```

Weight rationale:
- T (0.18): search demand as early signal
- S (0.28): social spread speed
- G (0.15): developer adoption confirms trend stickiness
- N (0.12): news/PR catalysts
- D (0.15): dev adoption anchor (npm + PyPI SDK downloads)
- M (0.12): mindshare (Wikipedia pageviews)

**Trading Signal** (composite with momentum):

```
Delta7(x) = x(t) - x(t-7)          # 7-day momentum
Accel(x)  = Delta7(x) - Delta7(x, t-7)  # acceleration

Signal_trade(t) = 0.60 * VI_trade(t) + 0.25 * norm(Delta7(VI_trade)) + 0.15 * norm(Accel(VI_trade))
```

All three sub-components normalized to 0-100.

#### Mode 2: Content/Marketing Index

```
VI_content(m,t) = 0.25*T + 0.35*S + 0.05*G + 0.20*N + 0.05*D + 0.10*M
```

Weight rationale:
- T (0.25): search demand = audience looking for explanations/guides
- S (0.35): video/social = real content virality
- G (0.05): developers matter less for content
- N (0.20): news events = content hooks
- D (0.05): dev adoption as filter, not driver
- M (0.10): mindshare (Wikipedia pageviews) as minor boost

**Topic Heat:**

```
Heat_content(t) = 0.50 * VI_content(t) + 0.50 * norm(Delta7(VI_content))
```

### 2.7 Divergence Signal (for traders)

```
Divergence(m,t) = z(Delta7(VI_trade(m))) - z(Delta7(odds(m)))
```

Where `odds(m)` = Polymarket probability for model m.

**Strategy A: Momentum Breakout**
- Entry: VI_trade > 70 AND Delta7 > 15 AND Accel > 0 AND odds grew < 5pp in 7 days
- Exit: odds catch up (+15pp from entry) OR Accel negative for 2 consecutive days

**Strategy B: Quality-Backed Virality**
- Entry: VI_trade growing AND Q > 75 AND G also growing
- Exit: Q or G momentum falls (loss of fundamental support)

### 2.8 Calibration & Backtesting

**Before launch**, validate against historical events:

| Event | Expected VI spike | Date |
|-------|------------------|------|
| GPT-4o release | ChatGPT VI > 85 | May 2024 |
| DeepSeek R1 launch | DeepSeek VI > 90 | Jan 2025 |
| Claude 3.5 Sonnet | Claude VI > 75 | Jun 2024 |
| Gemini Ultra launch | Gemini VI > 80 | Dec 2023 |
| Grok open-source | Grok VI > 70 | Mar 2024 |

If the index doesn't reflect these events, **adjust weights** before going live.

### 2.9 Goodhart's Law Mitigation

When the index becomes popular, companies may try to game it. Defenses:

1. **Weight rotation**: periodically adjust weights (quarterly review)
2. **Anomaly detection**: flag sudden metric spikes that don't correlate with other signals
3. **Source diversification**: no single source should dominate >35%
4. **Transparency**: publish methodology openly (paradoxically, transparency makes gaming harder because gaming attempts are visible)

---

## 3. Architecture

### 3.1 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| ETL / Data Pipeline | Python 3.11+ | Best library ecosystem for data (pytrends, PRAW, requests) |
| Scheduler | GitHub Actions (cron) | Free, reliable, no server needed |
| Database | Supabase (PostgreSQL) | Free tier generous, built-in Auth, real-time subscriptions |
| Cache | Upstash Redis | Free tier 10K commands/day, serverless |
| Backend API | Next.js API Routes | Collocated with frontend, Vercel serverless |
| Frontend | Next.js 14 + Tailwind CSS | SSR, fast, Vercel-native |
| Auth | Supabase Auth | Built-in, supports OAuth + magic links |
| Payments | Stripe | Industry standard, good docs |
| CDN / Security | Cloudflare | Free WAF + DDoS + DNS + edge caching |
| Hosting | Vercel | Free tier for frontend + API routes |
| Monitoring | Sentry (free tier) | Error tracking + performance |

**Rejected:**
- Streamlit: not production-grade, limited customization
- Railway: unnecessary if using Vercel serverless
- Twitter API: too expensive for MVP

### 3.2 Data Flow

```
[Data Sources]                    [ETL Layer]                [Storage]              [Serving]
                                  (GitHub Actions            (Supabase              (Vercel)
                                   cron: daily)               Postgres)

Google Trends ──┐                                            ┌─ models
YouTube API ────┤                ┌─ fetch_trends.py          ├─ model_aliases
Reddit API ─────┤──> Ingestion ──┤─ fetch_youtube.py         ├─ raw_metrics
GitHub API ─────┤    Layer       ├─ fetch_reddit.py    ──>   ├─ daily_scores        ┌─ Public Dashboard
GDELT API ──────┤                ├─ fetch_github.py          ├─ signals             ├─ Public API (cached)
Arena/AA ───────┤                ├─ fetch_news.py            ├─ users               ├─ Pro API (auth)
Polymarket ─────┘                ├─ fetch_quality.py         ├─ api_keys            └─ Alerts/Webhooks
                                 ├─ fetch_market.py          └─ plans
                                 └─ calc_index.py
                                      │
                                 [Processing]
                                 ├─ Dedup + alias mapping
                                 ├─ Quantile normalization
                                 ├─ EWMA smoothing
                                 ├─ Index calculation (trade + content)
                                 ├─ Momentum + Acceleration
                                 └─ Divergence signals
```

### 3.3 Database Schema (Supabase PostgreSQL)

```sql
-- Core tables
CREATE TABLE models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,           -- 'chatgpt', 'gemini', etc.
    name TEXT NOT NULL,                  -- 'ChatGPT'
    company TEXT NOT NULL,               -- 'OpenAI'
    logo_url TEXT,
    color TEXT,                          -- for charts, e.g. '#10A37F'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE model_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    alias_type TEXT NOT NULL,            -- 'search_query', 'github_repo', 'subreddit', 'gdelt_query'
    alias_value TEXT NOT NULL,
    UNIQUE(model_id, alias_type, alias_value)
);

-- Raw metrics (one row per model per source per day)
CREATE TABLE raw_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    source TEXT NOT NULL,                -- 'trends', 'youtube', 'reddit', 'github', 'gdelt', 'arena', 'polymarket'
    metric_name TEXT NOT NULL,           -- 'interest', 'video_count', 'stars_delta7', etc.
    metric_value NUMERIC NOT NULL,
    raw_json JSONB,                      -- full API response for debugging
    fetched_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(model_id, date, source, metric_name)
);

-- Normalized component scores (0-100)
CREATE TABLE component_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    component TEXT NOT NULL,             -- 'T', 'S', 'G', 'N', 'Q', 'M'
    raw_value NUMERIC,
    normalized_value NUMERIC NOT NULL,   -- 0-100 after quantile scaling
    smoothed_value NUMERIC,              -- after EWMA
    UNIQUE(model_id, date, component)
);

-- Daily composite index
CREATE TABLE daily_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    vi_trade NUMERIC NOT NULL,           -- 0-100
    vi_content NUMERIC NOT NULL,         -- 0-100
    signal_trade NUMERIC,               -- 0-100 (with momentum)
    heat_content NUMERIC,               -- 0-100 (with momentum)
    delta7_trade NUMERIC,
    delta7_content NUMERIC,
    accel_trade NUMERIC,
    accel_content NUMERIC,
    component_breakdown JSONB,           -- {T: 72, S: 85, G: 45, N: 60, Q: 78, M: 55}
    UNIQUE(model_id, date)
);

-- Arbitrage/divergence signals
CREATE TABLE signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    signal_type TEXT NOT NULL,           -- 'momentum_breakout', 'quality_backed', 'divergence'
    direction TEXT,                      -- 'bullish', 'bearish'
    strength NUMERIC,                    -- 0-100
    vi_trade NUMERIC,
    polymarket_odds NUMERIC,
    divergence_score NUMERIC,
    reasoning TEXT,
    expires_at DATE,
    UNIQUE(model_id, date, signal_type)
);

-- Users & Auth (extends Supabase auth.users)
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    plan TEXT DEFAULT 'free',            -- 'free', 'pro', 'enterprise'
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    api_calls_today INTEGER DEFAULT 0,
    api_calls_reset_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- API Keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,              -- bcrypt hash, never store plaintext
    key_prefix TEXT NOT NULL,            -- 'avi_pk_abc12...' for identification
    name TEXT,                           -- user-given name
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_raw_metrics_model_date ON raw_metrics(model_id, date);
CREATE INDEX idx_raw_metrics_source ON raw_metrics(source, date);
CREATE INDEX idx_component_scores_model_date ON component_scores(model_id, date);
CREATE INDEX idx_daily_scores_model_date ON daily_scores(model_id, date);
CREATE INDEX idx_daily_scores_date ON daily_scores(date);
CREATE INDEX idx_signals_date ON signals(date);
CREATE INDEX idx_signals_type ON signals(signal_type, date);

-- RLS Policies
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can read own API keys" ON api_keys
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys" ON api_keys
    FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### 3.4 API Endpoints

```
PUBLIC (no auth, cached 1 hour, 60 req/min by IP):
  GET  /api/v1/models                          -- list all tracked models
  GET  /api/v1/index/latest                     -- latest index for all models
  GET  /api/v1/index/latest?model=chatgpt       -- latest for one model
  GET  /api/v1/index/history?model=chatgpt&days=90  -- 90-day history (free: 90d max, 1-3 day delay)

PRO (API key required, 600 req/min):
  GET  /api/v1/index/history?model=chatgpt&from=2024-01-01&to=2025-12-31  -- full history
  GET  /api/v1/breakdown?model=chatgpt&date=2025-06-15  -- component breakdown (T/S/G/N/Q/M)
  GET  /api/v1/signals                          -- active divergence/trading signals
  GET  /api/v1/signals?model=chatgpt            -- signals for specific model
  GET  /api/v1/compare?models=chatgpt,gemini,claude&days=30  -- multi-model comparison

ENTERPRISE (API key + SLA):
  POST /api/v1/custom-index                     -- custom weights for portfolio
  GET  /api/v1/export?format=csv                -- bulk data export
  POST /api/v1/webhooks                         -- create alert webhooks
```

### 3.5 Security

| Measure | Implementation |
|---------|---------------|
| API Keys | Stored as bcrypt hashes only, shown once on creation |
| Auth | Supabase Auth (JWT), magic links + OAuth |
| Rate Limiting | Upstash Redis sliding window (IP for public, key for Pro) |
| DDoS | Cloudflare WAF + bot fight mode |
| CORS | Allowlist of own domains only |
| Input Validation | Zod schemas on all API inputs |
| Cache-first | Public endpoints hit edge cache, not DB |
| RLS | Supabase Row Level Security on user tables |
| Secrets | Environment variables, never in code |
| Audit | Log: who/when/which key/which endpoint |

---

## 4. Monetization

### 4.1 Subscription Tiers

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Current index (1-3 day delay), 90-day chart, top-7 models, basic API (60 req/min) |
| **Pro Trader** | $29/mo | Real-time data, full history, component breakdown, trading signals, divergence alerts, API 600 req/min |
| **Pro Builder** | $99/mo | Everything in Trader + higher API limits (3000 req/min), webhook alerts, CSV export, priority support |
| **Enterprise** | $499+/mo | Custom indices, white-label dashboard, SLA, dedicated support, BigQuery/S3 export |

### 4.2 Additional Revenue Streams

1. **Polymarket/Kalshi affiliate links** — referral commission on prediction market sign-ups
2. **"AI Virality Brief" newsletter** — weekly email with top movers (free = growth engine, sponsor slots = revenue)
3. **Embeddable widget** — `<iframe>` badge "Powered by AI Virality Index" (free = viral loop)
4. **Research reports** — "Monthly State of AI Virality" ($49-99 one-time or included in Pro)
5. **Content monetization** — TikTok/YouTube shorts with weekly index updates (RPM $3-8 + affiliate)
6. **Bot starter templates** — open-source Polymarket bot template that requires AVI API key

### 4.3 Pricing Rationale

- $9/mo (Perplexity proposal) is too low for trader audience. Traders pay $29-99 for actionable signals.
- $499+/mo enterprise is standard for B2B data API access.
- Free tier is critical for viral growth — the index itself must be public and shareable.

---

## 5. Project Structure

```
ai-virality-index/
├── .github/
│   └── workflows/
│       └── daily_etl.yml              # GitHub Actions cron job
├── etl/
│   ├── __init__.py
│   ├── config.py                      # API keys, model aliases, constants
│   ├── models_config.yaml             # Model aliases dictionary
│   ├── collectors/
│   │   ├── __init__.py
│   │   ├── base.py                    # Abstract collector class
│   │   ├── trends.py                  # Google Trends via pytrends
│   │   ├── youtube.py                 # YouTube Data API v3
│   │   ├── reddit.py                  # Reddit via PRAW
│   │   ├── github_collector.py        # GitHub REST/GraphQL API
│   │   ├── news.py                    # GDELT DOC API
│   │   ├── quality.py                 # Arena Elo + AA scraping
│   │   └── market.py                  # Polymarket Gamma API
│   ├── processing/
│   │   ├── __init__.py
│   │   ├── normalizer.py             # Quantile scaling + Winsorize
│   │   ├── smoother.py               # EWMA implementation
│   │   ├── index_calculator.py       # VI_trade, VI_content computation
│   │   └── signal_detector.py        # Divergence + trading signals
│   ├── storage/
│   │   ├── __init__.py
│   │   └── supabase_client.py        # Supabase upsert/read operations
│   ├── main.py                        # Orchestrator: fetch -> process -> store
│   └── requirements.txt
├── web/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx             # Root layout
│   │   │   ├── page.tsx               # Landing page
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx           # Main dashboard (heatmap + top movers)
│   │   │   ├── models/
│   │   │   │   └── [slug]/
│   │   │   │       └── page.tsx       # Individual model page
│   │   │   ├── pricing/
│   │   │   │   └── page.tsx
│   │   │   ├── docs/
│   │   │   │   └── page.tsx           # API documentation
│   │   │   └── api/
│   │   │       └── v1/
│   │   │           ├── models/
│   │   │           │   └── route.ts
│   │   │           ├── index/
│   │   │           │   ├── latest/
│   │   │           │   │   └── route.ts
│   │   │           │   └── history/
│   │   │           │       └── route.ts
│   │   │           ├── breakdown/
│   │   │           │   └── route.ts
│   │   │           ├── signals/
│   │   │           │   └── route.ts
│   │   │           └── compare/
│   │   │               └── route.ts
│   │   ├── components/
│   │   │   ├── ui/                    # Shared UI components
│   │   │   ├── IndexGauge.tsx         # Fear & Greed style gauge
│   │   │   ├── ModelCard.tsx          # Model summary card
│   │   │   ├── HeatMap.tsx            # Market overview heatmap
│   │   │   ├── SparkLine.tsx          # Mini chart
│   │   │   ├── IndexChart.tsx         # Full time-series chart
│   │   │   ├── BreakdownRadar.tsx     # Component radar chart
│   │   │   ├── TopMovers.tsx          # Biggest daily changes
│   │   │   └── CompareChart.tsx       # Multi-model comparison
│   │   ├── lib/
│   │   │   ├── supabase.ts            # Supabase client (browser + server)
│   │   │   ├── api.ts                 # API helper functions
│   │   │   ├── redis.ts               # Upstash Redis client
│   │   │   ├── stripe.ts              # Stripe helpers
│   │   │   └── utils.ts
│   │   └── middleware.ts              # Rate limiting + auth check
│   └── public/
│       ├── models/                    # Model logos
│       └── og-image.png              # Social share image
├── notebooks/
│   ├── backtest.ipynb                 # Weight calibration + event study
│   └── data_exploration.ipynb         # EDA on raw metrics
├── docs/
│   ├── TECHNICAL_SPEC.md              # This file
│   ├── IMPLEMENTATION_GUIDE.md        # Step-by-step build guide
│   └── API.md                         # API documentation
├── .env.example
├── .gitignore
├── README.md
└── LICENSE
```

### 5.1 GitHub Actions Workflow

```yaml
# .github/workflows/daily_etl.yml
name: Daily ETL Pipeline

on:
  schedule:
    - cron: '0 12 * * *'     # Run daily at 12:00 UTC
  workflow_dispatch:           # Manual trigger

jobs:
  etl:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install -r etl/requirements.txt

      - name: Run ETL pipeline
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
          YOUTUBE_API_KEY: ${{ secrets.YOUTUBE_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GH_API_TOKEN }}
          REDDIT_CLIENT_ID: ${{ secrets.REDDIT_CLIENT_ID }}
          REDDIT_CLIENT_SECRET: ${{ secrets.REDDIT_CLIENT_SECRET }}
        run: python -m etl.main

      - name: Notify on failure
        if: failure()
        run: echo "ETL pipeline failed!" # Replace with Sentry/email/Telegram alert
```

### 5.2 Python Dependencies (etl/requirements.txt)

```
# Data collection
pytrends>=4.9.0
praw>=7.7.0
google-api-python-client>=2.100.0
requests>=2.31.0

# Data processing
pandas>=2.1.0
numpy>=1.25.0

# Database
supabase>=2.0.0

# Utilities
python-dotenv>=1.0.0
pyyaml>=6.0.0
tenacity>=8.2.0          # Retry logic for API calls
```

---

## 6. Implementation Plan

### Phase 0: Project Setup (1-2 days)

- [ ] Register domain (e.g., aiviralityindex.com)
- [ ] Create GitHub repo (mono-repo)
- [ ] Set up Supabase project (Postgres + Auth)
- [ ] Set up Cloudflare DNS
- [ ] Create `.env` with all API keys
- [ ] Initialize Next.js project in `/web`
- [ ] Initialize Python project in `/etl`
- [ ] Run DDL schema in Supabase SQL editor
- [ ] Seed `models` and `model_aliases` tables

### Phase 1: ETL Collectors (4-5 days)

- [ ] Create base collector abstract class
- [ ] Implement `trends.py` (Google Trends via pytrends)
- [ ] Implement `youtube.py` (YouTube Data API v3)
- [ ] Implement `reddit.py` (Reddit PRAW)
- [ ] Implement `github_collector.py` (GitHub API)
- [ ] Implement `news.py` (GDELT DOC API)
- [ ] Implement `quality.py` (Arena Elo scraping)
- [ ] Implement `market.py` (Polymarket Gamma API)
- [ ] Implement `supabase_client.py` (upsert raw_metrics)
- [ ] Test each collector individually
- [ ] Create `main.py` orchestrator
- [ ] Set up GitHub Actions workflow (manual trigger first)

### Phase 2: Index Calculation (3-4 days)

- [ ] Implement `normalizer.py` (quantile scaling + winsorize)
- [ ] Implement `smoother.py` (EWMA)
- [ ] Implement `index_calculator.py` (VI_trade + VI_content)
- [ ] Implement momentum (Delta7) and acceleration
- [ ] Implement `signal_detector.py` (divergence detection)
- [ ] Write component_scores and daily_scores to Supabase
- [ ] Create `backtest.ipynb` for weight calibration
- [ ] Validate against historical events (GPT-4o, DeepSeek R1, etc.)
- [ ] Adjust weights based on backtesting results

### Phase 3: Public API (2-3 days)

- [ ] Implement `/api/v1/models` endpoint
- [ ] Implement `/api/v1/index/latest` endpoint
- [ ] Implement `/api/v1/index/history` endpoint
- [ ] Set up Upstash Redis caching
- [ ] Implement rate limiting middleware
- [ ] Add CORS configuration
- [ ] Add Zod input validation
- [ ] Test all public endpoints

### Phase 4: Dashboard (4-6 days)

- [ ] Build landing page (hero + what it is + methodology + pricing)
- [ ] Build main dashboard (heatmap + top movers + gauge)
- [ ] Build individual model pages (chart + breakdown radar)
- [ ] Build comparison view (multi-model chart)
- [ ] Implement IndexGauge component (Fear & Greed style)
- [ ] Implement SparkLine component
- [ ] Implement IndexChart with Recharts/Chart.js
- [ ] Mobile responsive design
- [ ] SEO pages: `/models/chatgpt`, `/models/gemini`, etc.

### Phase 5: Auth & Monetization (3-5 days)

- [ ] Set up Supabase Auth (magic links + Google OAuth)
- [ ] Build user profile page
- [ ] Implement API key generation (create/revoke/list)
- [ ] Set up Stripe products + prices (Pro Trader, Pro Builder, Enterprise)
- [ ] Implement Stripe Checkout + webhooks
- [ ] Link Stripe subscription status to Supabase user_profiles
- [ ] Implement plan-based access control in API routes
- [ ] Build pricing page with Stripe integration

### Phase 6: Pro Features + Polish (3-5 days)

- [ ] Implement `/api/v1/breakdown` (Pro only)
- [ ] Implement `/api/v1/signals` (Pro only)
- [ ] Implement `/api/v1/compare` (Pro only)
- [ ] Build email/webhook alert system
- [ ] API documentation page
- [ ] Embeddable widget (`<iframe>`)
- [ ] "Powered by AVI" badge
- [ ] Sentry error tracking
- [ ] Final testing + bug fixes

### Phase 7: Launch (2-3 days)

- [ ] Enable GitHub Actions cron (daily)
- [ ] Verify 3+ days of data looks correct
- [ ] Write launch post (Twitter/X, Reddit, HN, Product Hunt)
- [ ] Set up "AI Virality Brief" newsletter (Beehiiv/Buttondown)
- [ ] Submit to Product Hunt
- [ ] Monitor for issues

**Total estimate: 22-33 days** (one person + AI coding assistant)

---

## 7. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Google Trends pytrends breaks | High | Cache aggressively, implement retry logic, monitor for 429s |
| YouTube API quota exhaustion | Medium | Batch requests, cache 24h, request quota increase |
| GDELT API instability | Medium | Fallback to NewsAPI (free tier), cache results |
| Arena Elo data unavailable | Low | Q component degrades gracefully, flag incomplete data |
| Polymarket API changes | Medium | M component optional, degrade to 5-component formula |
| Goodhart's Law (gaming) | Long-term | Quarterly weight review, anomaly detection, source diversification |
| Platform dependency (Vercel/Supabase) | Low | Standard Postgres + Next.js = portable to any host |
| Legal issues (data scraping) | Low-Medium | Use only official APIs and open data (GDELT), no scraping of ToS-protected content |
| Clones/competitors appear | Medium | First-mover advantage, build trust in methodology, community |

---

## 8. Success Metrics

| Metric | Target (Month 1) | Target (Month 6) |
|--------|------------------|-------------------|
| Daily active dashboard users | 100 | 5,000 |
| API calls/day | 1,000 | 100,000 |
| Pro subscribers | 10 | 200 |
| Newsletter subscribers | 500 | 10,000 |
| Twitter/X followers | 1,000 | 20,000 |
| Product Hunt upvotes | 200+ | — |
| Revenue MRR | $300 | $8,000 |
