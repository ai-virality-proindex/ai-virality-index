# 60-Day Validation Checklist (Target: April 16, 2026)

## Honest Assessment (as of March 15, 2026 — 28 days of data)

### What the Index IS
The AI Virality Index is a **measurement tool** (like a thermometer) — it tells you the current "temperature" of AI model attention. It is **reactive, not predictive**. The score on day N reflects what happened on day N, not what will happen on day N+1.

### What the Index is NOT (yet)
It is NOT a predictive system. The signal detector was supposed to add a predictive layer, but:
- Old signals (`adoption_backed`) had a **7% hit rate** — worse than random
- New signals (`mean_reversion`, `trend_momentum`, `momentum_breakout`) have **0 real-world firings** — deployed Mar 15, never ran in production
- The "divergence" signal fires frequently (19 times in 28 days) but **accuracy has never been measured**

### What COULD be predictive (patterns observed but not automated)
These patterns were seen in 28 days of data but are NOT yet in the code:

1. **Decay half-life** (~3-4 days after major spike) — ChatGPT Agent went 98→41 in 9 days
2. **N leads S by 1-2 days** — news breaks before social catches up
3. **G as floor indicator** — when GitHub holds while S/T collapse, decline stabilizes (DeepSeek)
4. **Zero-sum dynamics** — when one model spikes to 90+, ALL others drop 30-57%
5. **"Dead cat bounce"** — after a crash, brief recovery before resuming decline

These are the REAL predictive insights. They are currently only documented in case studies, not implemented in code.

---

## Known Bugs to Fix

### Critical
1. **DeepSeek D normalization is broken**: raw D = 0-169 downloads, but smoothed D = 80.3. Rolling quantile normalization on tiny absolute numbers creates misleading scores. The q05/q95 window anchors on a narrow range, making 169 downloads look like 80/100.
   - **Fix**: Add minimum absolute threshold for D component. If raw < 1000, D should be 0 regardless of quantile.

2. **Copilot/Grok/Perplexity are signal-blind**: D=0 permanently, and `trend_momentum` has never been tested in production. These 3 models (43% of tracked models) generate ZERO signals.
   - **Check at 60 days**: Did trend_momentum fire at all? If not, thresholds are too strict.

3. **Negative GitHub deltas**: Some days show negative star counts (impossible). Data quality issue in GitHub collector.

### Data Quality
4. **pytrends 429 rate limiting**: Google blocks our IP regularly. T component has gaps.
5. **Reddit API still pending**: S component only has YouTube + HN (no Reddit).

---

## 60-Day Validation Plan

### Phase 1: Signal Audit (run at day 42 — ~March 29)
After 2 weeks of new signal code running:

- [ ] Count firings per signal type:
  - `divergence`: expect 10+
  - `momentum_breakout`: expect 5+
  - `mean_reversion`: expect 5+
  - `trend_momentum`: expect 3+ (only fires for Copilot/Grok/Perplexity)
- [ ] If any signal has 0 firings → thresholds are too strict, lower them
- [ ] If any signal fires every day → thresholds are too loose, raise them
- [ ] Check: do Copilot/Grok/Perplexity now get signals? If not, trend_momentum is broken

### Phase 2: Accuracy Measurement (run at day 60 — ~April 16)
With 30+ days of new signals:

- [ ] For each signal that fired, check what happened 3 days later:
  - Bullish signal → did VI go up within 3 days? (hit = yes)
  - Bearish signal → did VI go down within 3 days? (hit = yes)
- [ ] Calculate hit rate per signal type
- [ ] **Minimum viable accuracy: 55%** (better than coin flip)
- [ ] **Target accuracy: 65%+** (meaningful alpha)
- [ ] Kill any signal type with <50% hit rate
- [ ] Promote any signal type with >60% hit rate

### Phase 3: Predictive Patterns (implement if accuracy > 55%)
Convert observed patterns into automated signals:

- [ ] **Decay predictor**: After VI > 90 spike, predict ~50% decline within 4 days
  - Trigger: VI > 90 AND was < 60 yesterday
  - Prediction: "This spike will decay to ~55 within 4 days"
  - Backtest against ChatGPT Agent launch (Feb 19: 98→41)

- [ ] **News cascade predictor**: When N spikes but S hasn't followed yet
  - Trigger: N increased > 30pts today AND S increased < 10pts
  - Prediction: "S will spike within 1-2 days"
  - Backtest against Claude Pentagon feud (Feb 26: N first, S followed)

- [ ] **Floor detector**: When G holds while S/T collapse
  - Trigger: S dropped > 30% in 7 days AND G dropped < 10%
  - Prediction: "Decline is stabilizing, unlikely to crash further"
  - Backtest against DeepSeek (G held at 60 while S→6)

- [ ] **Zero-sum alert**: When any model breaks 85+
  - Trigger: Any model VI > 85
  - Prediction: "All other models will drop 20-40% within 48h"
  - Backtest against ChatGPT Agent spike

### Phase 4: Weight Revalidation
- [ ] Re-run component volatility analysis with 60 days
- [ ] Check if S (Social) is still too volatile at 0.20 weight
- [ ] Check if D (DevAdoption) at 0.20 is justified by stability
- [ ] Compare old weights (S=0.28) vs new weights (S=0.20) — which produces better event capture?

---

## Key Question to Answer at 60 Days

> **Can we predict anything 1-3 days in advance with >55% accuracy?**

If YES → the index has predictive value, can be marketed as "trading signals"
If NO → the index is a monitoring/analytics tool only, market it as "AI market dashboard" (still valuable, just different positioning)

---

## What to Tell Users NOW (honest positioning)

### Say:
- "Real-time AI model attention tracker"
- "See which AI models are trending and why"
- "Component breakdown shows what's driving attention (news, social, developer adoption)"
- "28 days of validated data capturing 9/10 major AI events"

### Don't say (yet):
- "Predict which AI model will trend next"
- "Trading signals for AI attention markets"
- "Predictive analytics for the AI industry"

We can upgrade messaging AFTER 60-day signal validation proves accuracy > 55%.

---

## Execution

### Python command to audit signals at day 42:
```python
# Run from project root
from etl.storage.supabase_client import get_client
from datetime import date, timedelta

client = get_client()

# Count signals by type since new code deployed
signals = client.table("signals").select("*").gte("date", "2026-03-15").execute()
from collections import Counter
type_counts = Counter(s["signal_type"] for s in signals.data)
print("Signal firings since Mar 15:", type_counts)

# Check hit rate: did direction predict 3-day movement?
for signal in signals.data:
    sig_date = date.fromisoformat(signal["date"])
    future_date = sig_date + timedelta(days=3)
    future = client.table("daily_scores").select("vi_trade").eq(
        "model_id", signal["model_id"]
    ).eq("date", future_date.isoformat()).execute()
    if future.data:
        future_vi = float(future.data[0]["vi_trade"])
        hit = (signal["direction"] == "bullish" and future_vi > signal["vi_trade"]) or \
              (signal["direction"] == "bearish" and future_vi < signal["vi_trade"])
        print(f"{signal['date']} {signal['signal_type']} {signal['direction']} "
              f"vi={signal['vi_trade']:.1f} -> {future_vi:.1f} {'HIT' if hit else 'MISS'}")
```

### Key metric to track weekly:
```
Signal Hit Rate = (correct predictions) / (total signals) × 100%
```
