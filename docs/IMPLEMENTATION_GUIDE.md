# AI Virality Index — Implementation Guide

> Step-by-step instructions for building AVI with Claude Code / Cowork.
> Each phase is a self-contained session. Copy the prompt, run it, verify the result.

---

## How to Use This Guide

### Principles

1. **One phase = one Claude Code session.** Don't try to do everything in one conversation.
2. **Always start with context.** Point Claude at TECHNICAL_SPEC.md at the beginning of each session.
3. **Verify before moving on.** Each phase has a "Done when" checklist.
4. **Save tokens.** Give Claude specific tasks, not open-ended exploration.
5. **Keep CLAUDE.md updated.** Add project-specific notes after each phase.

### Session Template

Every time you start a new Claude Code session for this project, begin with:

```
@E:\2026\AI Virality Index\TECHNICAL_SPEC.md

We're building the AI Virality Index project. I'm on Phase [X].
Here's what we need to do: [specific task from below].

The project repo is at: [path to your repo]
```

### Cowork Mode

If using Claude Desktop Cowork (Claude writes, you review):
- Paste the phase prompt
- Let Claude write code
- Review each file before accepting
- Run tests after each phase

---

## Pre-Setup (Before Phase 0)

### Accounts to Create (do this manually, not through Claude)

1. **GitHub** — create repo `ai-virality-index` (private for now)
2. **Supabase** — create project at supabase.com, save URL + anon key + service role key
3. **Cloudflare** — add your domain, get DNS set up
4. **Vercel** — connect GitHub repo
5. **Stripe** — create account, get test mode keys
6. **YouTube** — enable YouTube Data API v3 in Google Cloud Console, get API key
7. **Reddit** — create app at reddit.com/prefs/apps (script type), get client_id + secret
8. **GitHub Token** — generate PAT with `public_repo` scope

### API Keys Checklist

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
YOUTUBE_API_KEY=AIza...
GITHUB_TOKEN=ghp_...
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
REDDIT_USER_AGENT=AVI/1.0
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
UPSTASH_REDIS_URL=...
UPSTASH_REDIS_TOKEN=...
```

---

## Phase 0: Project Setup (1-2 days)

### Task 0.1 — Initialize Mono-Repo

**Prompt for Claude Code:**

```
Create a mono-repo structure for the AI Virality Index project.

Structure needed:
ai-virality-index/
├── etl/             # Python ETL pipeline
├── web/             # Next.js frontend + API
├── notebooks/       # Jupyter notebooks
├── docs/            # Documentation
├── .github/workflows/
├── .env.example
├── .gitignore
└── README.md

For etl/:
- Initialize with Python 3.11+
- Create requirements.txt with: pytrends, praw, google-api-python-client, requests, pandas, numpy, supabase, python-dotenv, pyyaml, tenacity
- Create config.py that loads .env
- Create models_config.yaml with the aliases dictionary from TECHNICAL_SPEC.md section 2.2
- Create empty collector modules with base class

For web/:
- Initialize Next.js 14 with App Router + TypeScript + Tailwind CSS
- Add dependencies: @supabase/supabase-js, @supabase/ssr, recharts, @upstash/redis, zod
- Create Supabase client helpers (browser + server)
- Create basic layout.tsx with dark theme

Create .env.example with all required keys (no values).
Create .gitignore (Python + Node + .env).
```

**Done when:**
- [ ] `etl/requirements.txt` exists and all packages install with `pip install -r etl/requirements.txt`
- [ ] `web/` runs with `npm run dev` and shows a blank page
- [ ] `models_config.yaml` has all 7 models with their aliases
- [ ] `.env.example` lists all required keys

### Task 0.2 — Database Schema

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md

Set up the Supabase database schema. Generate a single SQL file at etl/schema.sql
with ALL the DDL from TECHNICAL_SPEC.md section 3.3 (Database Schema).

Include:
- All tables (models, model_aliases, raw_metrics, component_scores, daily_scores, signals, user_profiles, api_keys)
- All indexes
- RLS policies
- Seed data: INSERT statements for the 7 models (chatgpt, gemini, claude, perplexity, deepseek, grok, copilot) with name, company, color
- Seed data: INSERT statements for model_aliases (all search queries, github repos, subreddits from models_config.yaml)

Output one clean SQL file that I can paste into Supabase SQL Editor.
```

**Done when:**
- [ ] `etl/schema.sql` exists
- [ ] Running it in Supabase SQL Editor creates all tables without errors
- [ ] `SELECT * FROM models` returns 7 rows
- [ ] `SELECT * FROM model_aliases` returns all aliases

---

## Phase 1: ETL Collectors (4-5 days)

### Task 1.1 — Base Collector + Trends

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md

Build the first two ETL modules:

1. etl/collectors/base.py — Abstract base class:
   - Abstract method: fetch(model_slug: str, aliases: list[str]) -> dict
   - Method: normalize_raw(data: dict) -> dict (placeholder)
   - Built-in retry logic using tenacity (3 retries, exponential backoff)
   - Logging with Python logging module

2. etl/collectors/trends.py — Google Trends collector:
   - Uses pytrends library
   - For each model, queries interest_over_time for all its search aliases
   - Aggregates aliases (take max interest across aliases)
   - Returns: {date, model_slug, source: 'trends', metrics: {interest: float, interest_7d_avg: float}}
   - Handle rate limiting (sleep between requests, random 1-3 sec delay)
   - Handle pytrends exceptions gracefully

3. etl/storage/supabase_client.py:
   - upsert_raw_metrics(model_id, date, source, metrics: dict) — upserts to raw_metrics table
   - get_model_id(slug: str) -> UUID
   - get_aliases(model_id: UUID, alias_type: str) -> list[str]
   - Uses supabase-py client with service role key

Test by running: python -c "from etl.collectors.trends import TrendsCollector; c = TrendsCollector(); print(c.fetch('chatgpt', ['ChatGPT', 'GPT-4o']))"
```

**Done when:**
- [ ] `TrendsCollector().fetch('chatgpt', ['ChatGPT'])` returns data without errors
- [ ] Data can be upserted to Supabase `raw_metrics` table
- [ ] `SELECT * FROM raw_metrics WHERE source = 'trends'` returns rows

### Task 1.2 — YouTube Collector

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md
@etl/collectors/base.py (for reference)

Build etl/collectors/youtube.py:
- Uses google-api-python-client (YouTube Data API v3)
- For each model, searches for videos published in the last 24 hours using alias queries
- Collects: video_count_24h, total_views_24h (from top results), avg_engagement (likes+comments/views)
- Respects API quota: minimize search.list calls (100 units each), batch videos.list calls
- Returns: {date, model_slug, source: 'youtube', metrics: {video_count_24h, total_views_24h, avg_engagement}}
- Error handling for quota exceeded (return partial data, log warning)

Keep it simple. We can optimize later.
```

**Done when:**
- [ ] Collector returns data for at least 3 models
- [ ] API quota usage is under 2000 units per full run (all 7 models)
- [ ] Data upserts to raw_metrics

### Task 1.3 — Reddit Collector

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md
@etl/collectors/base.py

Build etl/collectors/reddit.py:
- Uses PRAW (Python Reddit API Wrapper)
- For each model, checks its subreddit for:
  - New posts in last 24h: count
  - Total comments on those posts
  - Top post score (upvotes)
  - Subscriber count (as baseline)
- Returns: {date, model_slug, source: 'reddit', metrics: {posts_24h, comments_24h, top_score, subscribers}}
- Handle subreddit not found (some models may not have dedicated subreddit)
- Rate limit: PRAW handles this internally, but add 1s delay between models
```

### Task 1.4 — GitHub Collector

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md
@etl/collectors/base.py

Build etl/collectors/github_collector.py:
- Uses GitHub REST API (requests + auth token)
- For each model, queries its github_repos aliases
- For each repo, collects: stars_count, forks_count, open_issues_count, watchers_count
- Computes delta vs previous day (query raw_metrics for yesterday's values from Supabase)
- Returns: {date, model_slug, source: 'github', metrics: {total_stars, total_forks, stars_delta_1d, forks_delta_1d, issues_opened_24h}}
- Handle repos that don't exist or are private
- Use authenticated requests (5000/hour limit)
```

### Task 1.5 — News (GDELT) Collector

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md
@etl/collectors/base.py

Build etl/collectors/news.py:
- Uses GDELT DOC API (HTTP GET, no auth needed)
- Endpoint: https://api.gdeltproject.org/api/v2/doc/doc?query=...&mode=artlist&format=json
- For each model, queries by alias terms (e.g., "ChatGPT" OR "GPT-4o")
- Collects: article_count_24h, unique_sources_count, average_tone (GDELT provides tone scores)
- Timespan parameter: 24h
- Language filter: English (sourcelang:english)
- Returns: {date, model_slug, source: 'gdelt', metrics: {article_count, source_count, avg_tone}}
- Handle empty results and API timeouts gracefully
- Add 2-second delay between requests
```

### Task 1.6 — Quality (Arena) + Market (Polymarket) Collectors

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md
@etl/collectors/base.py

Build two collectors:

1. etl/collectors/quality.py:
   - Scrapes Chatbot Arena / LMArena leaderboard for Elo ratings
   - URL: https://lmarena.ai/ (check current structure)
   - For each model, extract: elo_rating, rank
   - If scraping is unreliable, make this a JSON config that we update manually weekly
   - Return: {date, model_slug, source: 'arena', metrics: {elo_rating, rank, elo_delta_7d}}

2. etl/collectors/market.py:
   - Uses Polymarket Gamma API
   - Look for markets related to AI models (e.g., "best AI model", "most popular AI")
   - For each model found in markets: current_odds, volume_24h
   - If no relevant market exists, return empty data
   - Return: {date, model_slug, source: 'polymarket', metrics: {odds, volume_24h, odds_delta_7d}}

Both should degrade gracefully if data is unavailable (return None for missing metrics).
```

### Task 1.7 — Main Orchestrator

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md
@etl/collectors/ (all collectors)
@etl/storage/supabase_client.py

Build etl/main.py — the main ETL orchestrator:

1. Load models_config.yaml
2. For each model, for each collector:
   - Call collector.fetch(model_slug, aliases)
   - Call supabase_client.upsert_raw_metrics(...)
3. Handle partial failures (if one collector fails, continue with others)
4. Log summary: "Fetched X metrics for Y models, Z errors"
5. Add CLI arguments: --model (single model), --source (single source), --dry-run

Should be runnable as: python -m etl.main
And for testing: python -m etl.main --model chatgpt --dry-run
```

**Phase 1 Done when:**
- [ ] `python -m etl.main` runs without crashing
- [ ] `SELECT source, COUNT(*) FROM raw_metrics GROUP BY source` shows data from all sources
- [ ] Each model has at least 3-4 sources of data
- [ ] GitHub Actions workflow triggers manually and completes

---

## Phase 2: Index Calculation (3-4 days)

### Task 2.1 — Normalizer + Smoother

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md (section 2.4 and 2.5)

Build two processing modules:

1. etl/processing/normalizer.py:
   - Function: quantile_normalize(values: list[float], window: int = 90) -> float
   - Compute q05, q95 on the rolling window
   - Winsorize: clip to [q05, q95]
   - Scale to 0-100: 100 * (x - q05) / (q95 - q05)
   - Handle edge cases: all same values, not enough history (< 7 days: use min-max fallback)

2. etl/processing/smoother.py:
   - Function: ewma(values: list[float], alpha: float) -> list[float]
   - Trading alpha: 0.35
   - Content alpha: 0.25
   - Function: moving_average(values: list[float], window: int = 7) -> list[float]

Write unit tests in etl/tests/test_normalizer.py and etl/tests/test_smoother.py.
Test with synthetic data to verify:
- Outlier resistance (one value 10x normal should not break scale)
- EWMA responds faster with higher alpha
- Edge cases (empty list, single value, all zeros)
```

### Task 2.2 — Index Calculator

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md (section 2.6)
@etl/processing/normalizer.py
@etl/processing/smoother.py

Build etl/processing/index_calculator.py:

1. Function: calculate_index(model_id, date, mode='trade') -> dict
   - Query raw_metrics from Supabase for the model (last 90 days)
   - Group by component (T, S, G, N, Q, M)
   - Normalize each component using quantile_normalize
   - Smooth using EWMA (alpha depends on mode)
   - Apply weights:
     Trading: T=0.20, S=0.20, G=0.15, N=0.10, Q=0.20, M=0.15
     Content: T=0.28, S=0.32, G=0.08, N=0.20, Q=0.05, M=0.07

2. Function: calculate_momentum(scores: list[float]) -> dict
   - delta7: current - 7 days ago
   - acceleration: current_delta7 - previous_delta7
   - Normalize both to 0-100

3. Function: calculate_signal_trade(vi_trade, delta7, accel) -> float
   - 0.60 * vi_trade + 0.25 * norm(delta7) + 0.15 * norm(accel)

4. Function: calculate_heat_content(vi_content, delta7) -> float
   - 0.50 * vi_content + 0.50 * norm(delta7)

5. Function: run_daily_calculation(date) -> None
   - For all active models:
   - Calculate both indices
   - Write to component_scores and daily_scores tables

Component mapping (raw_metrics -> components):
- T: source='trends', metric='interest'
- S: source in ('youtube','reddit'), metrics averaged
- G: source='github', metric='stars_delta_1d' + 'forks_delta_1d'
- N: source='gdelt', metric='article_count'
- Q: source='arena', metric='elo_rating'
- M: source='polymarket', metric='odds'
```

### Task 2.3 — Signal Detector

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md (section 2.7)
@etl/processing/index_calculator.py

Build etl/processing/signal_detector.py:

1. Function: detect_divergence(model_id, date) -> dict | None
   - Get VI_trade delta7 (z-scored)
   - Get Polymarket odds delta7 (z-scored)
   - Divergence = z(delta7_vi) - z(delta7_odds)
   - If |Divergence| > 1.5: return signal

2. Function: detect_momentum_breakout(model_id, date) -> dict | None
   - Conditions: VI_trade > 70 AND delta7 > 15 AND accel > 0
   - Check if odds grew < 5pp in 7 days
   - If all conditions met: return bullish signal

3. Function: detect_quality_backed(model_id, date) -> dict | None
   - Conditions: VI_trade growing AND Q > 75 AND G growing
   - If all conditions met: return signal

4. Function: run_signal_detection(date) -> list[dict]
   - Run all detectors for all models
   - Write results to signals table
   - Return list of detected signals

Each signal dict: {model_id, date, signal_type, direction, strength, vi_trade, polymarket_odds, divergence_score, reasoning}
```

### Task 2.4 — Update Main Orchestrator

**Prompt for Claude Code:**

```
@etl/main.py
@etl/processing/index_calculator.py
@etl/processing/signal_detector.py

Update etl/main.py to add processing step after data collection:

1. Fetch all raw data (existing)
2. NEW: Run index calculation for today
3. NEW: Run signal detection for today
4. Log: "Index calculated for X models. Y signals detected."

Add CLI flag: --skip-fetch (only run calculation, useful for re-processing)
```

**Phase 2 Done when:**
- [ ] `python -m etl.main` fetches data AND calculates indices
- [ ] `SELECT * FROM daily_scores ORDER BY date DESC LIMIT 7` shows reasonable 0-100 values
- [ ] `SELECT * FROM component_scores WHERE date = CURRENT_DATE` shows all 6 components for each model
- [ ] Unit tests pass: `python -m pytest etl/tests/`
- [ ] No component is stuck at 0 or 100 (normalization works)

---

## Phase 3: Public API (2-3 days)

### Task 3.1 — API Routes

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md (section 3.4)
@web/src/lib/supabase.ts

Build the public API routes in web/src/app/api/v1/:

1. /api/v1/models/route.ts
   - GET: return all active models [{slug, name, company, color, logo_url}]
   - Cache: 1 hour

2. /api/v1/index/latest/route.ts
   - GET: return latest daily_scores for all models
   - GET ?model=chatgpt: return latest for one model
   - Free users: data is delayed by 1 day (WHERE date <= CURRENT_DATE - 1)
   - Response: {model, date, vi_trade, vi_content, signal_trade, heat_content, delta7_trade, delta7_content}

3. /api/v1/index/history/route.ts
   - GET ?model=chatgpt&days=90: return time series
   - Free: max 90 days, 1-day delay
   - Pro: unlimited, real-time
   - Response: [{date, vi_trade, vi_content, ...}]

Use Zod for query parameter validation.
All responses: { data: [...], meta: { model, from, to, count } }
Error responses: { error: { code, message } }
```

### Task 3.2 — Rate Limiting + Auth Middleware

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md (section 3.5)

Build web/src/middleware.ts:

1. Rate limiting using Upstash Redis (@upstash/ratelimit):
   - Public (no API key): 60 requests/min by IP
   - Pro (valid API key): 600 requests/min by key
   - Enterprise: 3000 requests/min

2. API key auth:
   - Check header: Authorization: Bearer avi_pk_...
   - Look up key_prefix in api_keys table
   - Verify bcrypt hash
   - Check if user plan allows the endpoint
   - Update last_used_at

3. Apply only to /api/v1/* routes

Also create web/src/lib/redis.ts for Upstash client initialization.
```

### Task 3.3 — Pro API Routes

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md (section 3.4)

Build Pro-only API routes (require valid API key with Pro+ plan):

1. /api/v1/breakdown/route.ts
   - GET ?model=chatgpt&date=2025-06-15
   - Return component breakdown: {T: 72, S: 85, G: 45, N: 60, Q: 78, M: 55}
   - Source: component_scores table

2. /api/v1/signals/route.ts
   - GET: all active signals
   - GET ?model=chatgpt: signals for specific model
   - Return: [{model, date, signal_type, direction, strength, reasoning}]

3. /api/v1/compare/route.ts
   - GET ?models=chatgpt,gemini,claude&days=30
   - Return time series for multiple models side by side

If no valid API key or plan too low: return 403 with upgrade message.
```

**Phase 3 Done when:**
- [ ] `curl localhost:3000/api/v1/models` returns 7 models
- [ ] `curl localhost:3000/api/v1/index/latest` returns index data
- [ ] Rate limiting works (61st request in 1 min returns 429)
- [ ] Pro endpoints return 403 without API key
- [ ] All responses match the schema (data + meta)

---

## Phase 4: Dashboard (4-6 days)

### Task 4.1 — Landing Page

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md

Build the landing page at web/src/app/page.tsx:

Design: dark theme (like crypto dashboards), professional, clean.
Use Tailwind CSS. No UI library needed.

Sections:
1. Hero: "AI Virality Index" + tagline "The Fear & Greed Index for AI Models" + live mini-gauge showing today's top model
2. "How it works": 3 cards (Track -> Analyze -> Act)
3. Live preview: embedded mini-dashboard showing current top 3 models with sparklines
4. "Two modes" section: Trading vs Content cards with feature bullets
5. Pricing section: 3 tiers (Free / Pro Trader / Pro Builder)
6. CTA: "Start tracking free" button
7. Footer: links, "Powered by AI Virality Index"

Fetch live data from /api/v1/index/latest for the preview section.
```

### Task 4.2 — Main Dashboard

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md

Build the main dashboard at web/src/app/dashboard/page.tsx:

Components needed:
1. IndexGauge — circular gauge 0-100 with color gradient (red 0-25, orange 25-50, yellow 50-75, green 75-100)
2. HeatMap — grid of model cards, color-coded by current VI score
3. TopMovers — "Biggest Gainers" and "Biggest Losers" (by delta7)
4. ModelCard — shows: logo, name, VI_trade score, sparkline (7d), delta badge (+12 or -5)

Layout:
- Top: overall market summary (average VI across all models) with IndexGauge
- Middle: HeatMap grid of all models
- Bottom: TopMovers (2 columns: gainers / losers)

Mode toggle: Trading / Content (switches between VI_trade and VI_content display)

Fetch data from /api/v1/index/latest.
Use recharts for sparklines.
Mobile responsive (stack cards vertically on mobile).
```

### Task 4.3 — Model Detail Page

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md

Build the model detail page at web/src/app/models/[slug]/page.tsx:

1. Header: model name, logo, current VI_trade + VI_content scores with IndexGauge
2. Main chart: time series of VI_trade and VI_content (90 days default, toggleable)
   - Use recharts (AreaChart)
   - Toggle: 7d / 30d / 90d / 1y
3. Component breakdown: radar chart showing T/S/G/N/Q/M (6 axes)
   - Use recharts (RadarChart)
   - Only visible for Pro users (show blurred preview for free)
4. Momentum section: delta7 and acceleration with directional arrows
5. Active signals section (Pro only): current trading signals for this model

Generate SEO-friendly pages for each model.
Use generateStaticParams for /models/chatgpt, /models/gemini, etc.
Fetch data from /api/v1/index/history and /api/v1/breakdown.
```

### Task 4.4 — Comparison View

**Prompt for Claude Code:**

```
Build a comparison page at web/src/app/compare/page.tsx:

1. Model selector: multi-select dropdown (pick 2-4 models)
2. Chart: overlaid time series (one line per model, color-coded)
3. Table below: side-by-side metrics (VI_trade, VI_content, delta7, top component)
4. Time range toggle: 7d / 30d / 90d

Fetch data from /api/v1/compare.
Use recharts LineChart with multiple Line series.
```

**Phase 4 Done when:**
- [ ] Landing page loads and shows live data
- [ ] Dashboard shows all 7 models with scores and sparklines
- [ ] Model detail page works for each slug
- [ ] Comparison page works with 2-3 models
- [ ] Trading/Content mode toggle works
- [ ] Mobile responsive on all pages

---

## Phase 5: Auth & Monetization (3-5 days)

### Task 5.1 — Auth Setup

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md

Set up Supabase Auth in the Next.js app:

1. Configure Supabase Auth with:
   - Magic link (email)
   - Google OAuth (optional, if user has Google Cloud set up)

2. Build:
   - web/src/app/login/page.tsx — login form (email magic link)
   - web/src/app/auth/callback/route.ts — auth callback handler
   - web/src/components/AuthButton.tsx — login/logout button for header
   - web/src/lib/auth.ts — helper functions (getUser, requireAuth)

3. Protect routes:
   - /dashboard — public (but show upsell for Pro features)
   - /api/v1/breakdown, /signals, /compare — require Pro plan

4. Create user_profiles row on first login (via Supabase trigger or API)
```

### Task 5.2 — API Key Management

**Prompt for Claude Code:**

```
Build API key management:

1. web/src/app/dashboard/keys/page.tsx:
   - "Create new API key" button
   - Shows key ONCE after creation (modal with copy button)
   - List of existing keys (prefix, name, created_at, last_used_at)
   - Revoke button per key

2. API route: /api/keys/route.ts
   - POST: generate new key (crypto.randomBytes), store bcrypt hash
   - GET: list user's keys (prefix + metadata only)
   - DELETE: revoke key (set is_active = false)

Key format: avi_pk_[32 random hex chars]
Store in api_keys table: key_hash (bcrypt), key_prefix (first 12 chars for identification)
```

### Task 5.3 — Stripe Integration

**Prompt for Claude Code:**

```
@TECHNICAL_SPEC.md (section 4)

Set up Stripe subscriptions:

1. Create Stripe products + prices (in Stripe dashboard or via API):
   - Pro Trader: $29/mo (price_id: price_trader_monthly)
   - Pro Builder: $99/mo (price_id: price_builder_monthly)
   - Enterprise: custom (contact form)

2. Build:
   - web/src/app/api/stripe/checkout/route.ts — create Checkout Session
   - web/src/app/api/stripe/webhook/route.ts — handle subscription events
   - web/src/app/api/stripe/portal/route.ts — customer portal redirect

3. Webhook events to handle:
   - checkout.session.completed -> update user_profiles.plan = 'pro'
   - customer.subscription.deleted -> update user_profiles.plan = 'free'
   - customer.subscription.updated -> update plan accordingly

4. Update pricing page with real Stripe checkout links.

5. web/src/lib/stripe.ts — Stripe client helpers
```

**Phase 5 Done when:**
- [ ] User can sign up via magic link
- [ ] User can create/revoke API keys
- [ ] Stripe checkout works (test mode)
- [ ] Webhook updates user plan correctly
- [ ] Pro API endpoints accessible with valid API key + Pro plan
- [ ] Free users see blurred/locked Pro content

---

## Phase 6: Pro Features + Polish (3-5 days)

### Task 6.1 — Alerts System

**Prompt for Claude Code:**

```
Build a basic alert system for Pro users:

1. Database: add alerts table
   - user_id, model_id, condition (vi_trade_above, vi_trade_below, signal_detected), threshold, channel (email, webhook_url), is_active

2. UI: web/src/app/dashboard/alerts/page.tsx
   - Create alert form: select model, condition, threshold
   - List active alerts with toggle on/off

3. Check alerts in ETL pipeline (after daily calculation):
   - etl/alerts.py — query active alerts, check conditions, send notifications
   - Email via Supabase (or simple SMTP)
   - Webhook: POST to user's URL with signal data
```

### Task 6.2 — Embeddable Widget

**Prompt for Claude Code:**

```
Build an embeddable widget:

1. web/src/app/embed/[slug]/page.tsx — minimal page showing:
   - Model name + VI_trade score + sparkline
   - "Powered by AI Virality Index" link
   - No header/footer, transparent background option

2. Generate embed code:
   <iframe src="https://aiviralityindex.com/embed/chatgpt" width="300" height="200" frameborder="0"></iframe>

3. Add "Get embed code" button on model detail pages.
```

### Task 6.3 — API Documentation

**Prompt for Claude Code:**

```
Build API docs page at web/src/app/docs/page.tsx:

- Styled documentation page (dark theme)
- Sections: Authentication, Endpoints, Rate Limits, Response Formats, Error Codes
- Code examples in: curl, Python, JavaScript
- Interactive "Try it" section for public endpoints
- Copy-to-clipboard for code snippets

Content based on TECHNICAL_SPEC.md section 3.4.
```

### Task 6.4 — Final Polish

**Prompt for Claude Code:**

```
Final polish tasks:

1. Add Sentry error tracking (web + etl)
2. Add Open Graph meta tags for social sharing (og:image, og:title, og:description)
3. Create og-image.png (can be a simple branded card)
4. Add sitemap.xml generation
5. Add robots.txt
6. Performance: add loading skeletons for dashboard components
7. Verify all pages are mobile responsive
8. Add 404 page
9. Add error boundary components
```

**Phase 6 Done when:**
- [ ] Alerts create/fire correctly
- [ ] Widget embeds and displays data
- [ ] API docs page is complete and accurate
- [ ] Sentry captures errors
- [ ] Site passes Lighthouse audit > 80 on all metrics

---

## Phase 7: Launch (2-3 days)

### Task 7.1 — Go Live

**Manual steps (not Claude Code):**

1. Enable GitHub Actions cron schedule
2. Monitor 3 days of automated data collection
3. Verify data quality in Supabase
4. Switch Stripe from test to live mode
5. Set up custom domain on Vercel
6. Verify Cloudflare SSL + caching

### Task 7.2 — Launch Content

**Prompt for Claude Code:**

```
Generate launch content:

1. README.md for GitHub (public repo):
   - What is AVI
   - How the index works (brief)
   - API quick start
   - Link to docs
   - Screenshots/GIFs

2. Product Hunt description (title, tagline, description, topics)

3. Twitter/X launch thread (5-7 tweets)

4. Reddit post for r/artificial, r/ChatGPT, r/LocalLLaMA

5. Hacker News "Show HN" post
```

---

## Troubleshooting & Tips

### Common Issues

| Problem | Solution |
|---------|----------|
| pytrends returns empty data | Google may rate-limit. Add longer delays (5-10s). Try different timeframes. |
| YouTube API quota exceeded | Reduce queries per model. Cache results. Request quota increase in Google Cloud. |
| Supabase connection timeout | Check if you're using service_role key (not anon key) for ETL. |
| Index values all 0 or 100 | Not enough historical data. Need 7+ days minimum, 30+ for good normalization. |
| GitHub Actions fails | Check secrets are set in repo Settings > Secrets. Check Python version. |
| GDELT returns no results | Try broader query terms. Check GDELT status page. |

### Token-Saving Tips for Claude Code

1. **Be specific.** "Build the YouTube collector" is better than "Build the next thing."
2. **Reference files.** Use `@filepath` to give Claude context without explaining.
3. **One task per session.** Don't ask Claude to build everything at once.
4. **Review incrementally.** Check each file before moving to the next task.
5. **Use --dry-run.** Test ETL without hitting APIs during development.
6. **Copy errors exactly.** If something fails, paste the full error message.

### CLAUDE.md for This Project

Create this file in the project root so Claude Code has persistent context:

```markdown
# AI Virality Index

## Project
Real-time AI model virality index (0-100). Two modes: Trading + Content.

## Tech Stack
- ETL: Python 3.11, pytrends, PRAW, google-api-python-client, GDELT
- Web: Next.js 14, TypeScript, Tailwind CSS, Recharts
- DB: Supabase (PostgreSQL + Auth)
- Cache: Upstash Redis
- Payments: Stripe
- Hosting: Vercel + Cloudflare
- CI/CD: GitHub Actions

## Key Files
- etl/main.py — ETL orchestrator
- etl/processing/index_calculator.py — core index math
- web/src/app/api/v1/ — API routes
- web/src/app/dashboard/ — main dashboard

## Conventions
- Python: snake_case, type hints, docstrings
- TypeScript: camelCase, Zod validation on API inputs
- All API responses: { data, meta } or { error: { code, message } }
- Database: Supabase, use service_role key for ETL, anon key for frontend

## Important
- See TECHNICAL_SPEC.md for full formulas, weights, and architecture
- Two index modes: VI_trade (for traders) and VI_content (for content creators)
- Normalization: Rolling quantile (q05/q95) + Winsorize + EWMA
- 7 models tracked: chatgpt, gemini, claude, perplexity, deepseek, grok, copilot
```
