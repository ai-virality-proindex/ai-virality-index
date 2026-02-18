# Replace Market (M) Component with Wikipedia Pageviews (W)

**Date:** 2026-02-18
**Status:** Approved

## Problem

The M (Market Conviction) component uses Polymarket Gamma API, but there are no active prediction markets for AI models on Polymarket. All 7 models return `odds=0.0`, which normalizes to `M=50` (neutral) for every model. This means 15% of VI_trade and 7% of VI_content carry zero useful signal.

Additionally, Google Trends (T) has ~40% uptime due to aggressive 429 rate limiting.

## Decision

1. **Replace M (Polymarket) with W (Wikipedia Pageviews)** - same slot, same weight, new data source
2. **Add trendspy fallback for T (Google Trends)** - try trendspy when pytrends gets 429'd
3. **Keep GDELT (N) as-is** - recently fixed (Feb 18), monitor for regression

## Design: Wikipedia Pageviews Collector

### API
- **Endpoint:** `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{project}/{access}/{agent}/{article}/{granularity}/{start}/{end}`
- **Auth:** None required
- **Rate limit:** None enforced (be respectful, 1 req/sec)
- **Response:** JSON with `items[].views` per day

### Wikipedia Article Mapping
```yaml
chatgpt:    "ChatGPT"
gemini:     "Gemini_(chatbot)"
claude:     "Claude_(language_model)"
perplexity: "Perplexity_(search_engine)"  # Verify exact title
deepseek:   "DeepSeek"
grok:       "Grok_(chatbot)"
copilot:    "GitHub_Copilot"
```

### Metrics Returned
- `pageviews_7d`: Total pageviews over last 7 days
- `pageviews_daily_avg`: Average daily pageviews (7d)

### Component Code
- Component letter stays **M** in the database (to avoid schema migration)
- Label changes from "Market" to "Mindshare" in the frontend
- `COMPONENT_SOURCES["M"]` changes from `("polymarket", "odds")` to `("wikipedia", "pageviews_7d")`

### Index Weights (unchanged)
```
Trading: 0.20*T + 0.20*S + 0.15*G + 0.10*N + 0.20*Q + 0.15*M(wiki)
Content: 0.28*T + 0.32*S + 0.08*G + 0.20*N + 0.05*Q + 0.07*M(wiki)
```

## Design: Trendspy Fallback for T

### Logic
```
1. Try pytrends (current behavior)
2. If 429 error after all retries -> try trendspy
3. If trendspy also fails -> return None (use last known data from DB)
```

### Implementation
- Add `_fetch_with_trendspy()` method to TrendsCollector
- Call it as fallback when pytrends returns 429 on all retries

## Files to Modify

### New Files
- `etl/collectors/wikipedia.py` - WikipediaCollector class

### Modified Files
- `etl/config.py` - Update M weight comment
- `etl/main.py` - Register WikipediaCollector, remove PolymarketCollector
- `etl/processing/index_calculator.py` - Update COMPONENT_SOURCES for M
- `etl/models_config.yaml` - Add wikipedia_article field per model
- `etl/collectors/trends.py` - Add trendspy fallback
- `web/src/components/BreakdownRadar.tsx` - Update M label and hints
- `web/src/app/models/[slug]/page.tsx` - Update LABELS for M

## Risks
- Wikipedia article titles may change (mitigated: use redirect-following)
- Some newer models may have fewer pageviews (mitigated: quantile normalization handles varying scales)
- trendspy may also get rate limited (mitigated: graceful degradation to last known value)
