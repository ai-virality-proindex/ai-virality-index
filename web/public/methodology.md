# AI Virality Index — Methodology

**Version:** 2.0 (March 2026)
**Validated:** 28 days of live data (Feb 16 – Mar 15, 2026)

---

## 1. What Is the AI Virality Index?

The AI Virality Index (AVI) is a composite score (0–100) that measures the real-time virality and momentum of leading AI models. It answers the question: *"Which AI model is capturing the most attention right now?"*

AVI tracks 7 models: ChatGPT, Gemini, Claude, Perplexity, DeepSeek, Grok, and Copilot.

Two scoring modes serve different audiences:
- **Trading Mode** — balanced across all signals, for traders and investors
- **Content Mode** — emphasizes public attention, for content creators and marketers

---

## 2. Data Sources (6 Components)

| Component | Code | Source | What It Measures | Update Frequency |
|-----------|------|--------|-----------------|-----------------|
| **Search Trends** | T | Google Trends | Public search interest | Daily |
| **Social Buzz** | S | YouTube + Hacker News | Video views + developer discussion | Daily |
| **GitHub Activity** | G | GitHub API | Star/fork velocity (developer adoption) | Daily |
| **News Coverage** | N | GDELT | Global news article mentions | Daily |
| **Dev Adoption** | D | npm + PyPI | SDK download counts | Daily |
| **Mindshare** | M | Wikipedia | Page views (general public awareness) | Daily |

### Why These Sources?

Each component captures a different dimension of virality:
- **T + N** = *public awareness* (search + news)
- **S** = *community engagement* (videos + discussions)
- **G + D** = *developer adoption* (code + packages)
- **M** = *general mindshare* (encyclopedic interest)

No single source can measure virality alone. A model might dominate news (N=100) but have zero developer adoption (D=0). AVI captures the full picture.

---

## 3. Scoring Formula

### Trading Mode
```
VI_trade = 0.18×T + 0.20×S + 0.12×G + 0.15×N + 0.20×D + 0.15×M
```

### Content Mode
```
VI_content = 0.25×T + 0.25×S + 0.05×G + 0.25×N + 0.05×D + 0.15×M
```

### Weight Rationale (v2.0, calibrated March 2026)

Weights were calibrated using 28 days of live data analysis:

| Component | Trading | Content | Rationale |
|-----------|---------|---------|-----------|
| T (Trends) | 0.18 | 0.25 | Moderate volatility, reliable baseline signal |
| S (Social) | 0.20 | 0.25 | Reduced from 0.28/0.35 — most volatile component, YouTube view counts fluctuate wildly |
| G (GitHub) | 0.12 | 0.05 | Reduced — correlates with D at +0.50 (partially redundant) |
| N (News) | 0.15 | 0.25 | Increased — best leading indicator (1-2 day lead over other components) |
| D (DevAdoption) | 0.20 | 0.05 | Increased — most stable and reliable data source |
| M (Mindshare) | 0.15 | 0.15 | Increased — captures broader public interest |

---

## 4. Normalization Pipeline

Raw values are heterogeneous (YouTube views in millions, GitHub stars in hundreds). The normalization pipeline converts all metrics to a 0–100 scale:

### Step 1: Rolling Quantile Normalization
For each component per model, using 90-day rolling window:
- Compute q05 and q95 percentiles of the historical distribution
- Scale current value: `normalized = (value - q05) / (q95 - q05) * 100`
- Winsorize: clamp to [0, 100]

### Step 2: Cross-Model Normalization (sparse data)
When a model has fewer than 7 days of history (e.g., newly tracked), per-model quantile normalization fails. In this case:
- Rank all 7 models by raw value for that component
- Scale non-zero values to 10–100 range using min-max across models
- Models with zero values get 0

### Step 3: EWMA Smoothing
Apply Exponential Weighted Moving Average to reduce noise:
- Trading mode: alpha = 0.35 (more responsive to recent changes)
- Content mode: alpha = 0.25 (smoother, less reactive)

---

## 5. Momentum & Acceleration

### Delta7 (7-Day Momentum)
```
Delta7(t) = VI(t) - VI(t-7)
```
Positive = model gaining virality. Negative = losing.

### Acceleration
```
Accel(t) = Delta7(t) - Delta7(t-7)
```
Positive = momentum increasing. Negative = momentum fading.

### Trading Signal
```
Signal_trade = 0.60 × VI_trade + 0.25 × norm(Delta7) + 0.15 × norm(Accel)
```

### Content Heat
```
Heat_content = 0.50 × VI_content + 0.50 × norm(Delta7_content)
```

---

## 6. Signal Detection System

AVI generates four types of actionable signals:

### Divergence
Fires when VI_trade momentum diverges significantly from DevAdoption (D) momentum.
- **Bearish divergence**: VI rising but D flat → hype without substance, likely to correct
- **Bullish divergence**: VI falling but D strong → undervalued, likely to recover
- Threshold: |z(VI_delta7) - z(D_delta7)| > 1.5

### Momentum Breakout
Fires when a model shows strong upward momentum not yet confirmed by adoption:
- VI > 55, Delta7 > 8, DevAdoption growth < 10%
- Indicates viral moment that may or may not convert to real adoption

### Mean Reversion
Fires when a model has dropped significantly but fundamentals remain strong:
- Delta7 < -5 AND D > 40 (or T > 30 / N > 40 for non-SDK models)
- Direction: bullish (oversold, likely to bounce)

### Trend Momentum
Specifically for non-SDK models (Copilot, Grok, Perplexity) that lack DevAdoption data:
- Uses T + S + N components instead of D
- Bullish: T growing AND (N > 40 OR S > 30)
- Bearish: T declining AND N < 20 AND S < 20

---

## 7. Validation Results

### 28-Day Backtest (Feb 16 – Mar 15, 2026)

**Event correlation: 9 out of 10 major events captured**

| Event | Date | Index Reaction |
|-------|------|----------------|
| ChatGPT Agent launch | Feb 19 | +54 pts (44→99), all components maxed |
| Claude #1 App Store | Mar 3 | Claude overtook ChatGPT in Week 2 |
| DeepSeek V4 no-show | Mar 4 | Content -39% (biggest decline) |
| Perplexity Computer | Feb 25 | +35 pts spike, news-driven |
| xAI co-founder exodus | Feb-Mar | Grok hit period low (14.48) |

### Component Performance

| Component | Predictive Power | Stability | Notes |
|-----------|-----------------|-----------|-------|
| N (News) | Best leading indicator | Medium | 1-2 day lead |
| D (DevAdoption) | Strong | Highest | Most reliable |
| T (Trends) | Good | Medium | Real-time signal |
| G (GitHub) | Moderate | Medium-High | 2-3 day lead for D |
| S (Social) | Reactive | Low | Lags news by 1-2 days |
| M (Mindshare) | Lagging | Low | 3-5 day delay |

---

## 8. Limitations

1. **Data source dependency**: If Google Trends, YouTube, or GDELT has an outage, components will show stale data. EWMA smoothing mitigates short gaps.

2. **Structural gaps**: Models without SDK packages (Copilot, Grok, Perplexity) always have D=0 and often G=0, structurally limiting their Trading mode score.

3. **Zero-sum effects**: Google Trends data is inherently relative — when one model surges in searches, others appear to decline even if absolute interest is unchanged.

4. **EWMA memory**: Smoothing creates "memory" — a big spike (like ChatGPT's Feb 19 event) takes 3-7 days to fully decay, even if the underlying signal has already returned to baseline.

5. **Signal detection threshold sensitivity**: Current thresholds were calibrated on 28 days of data. More data will allow finer calibration.

---

## 9. Update History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 16, 2026 | Initial launch with 6 components, Q (Arena Elo) included |
| 1.5 | Feb 18, 2026 | Replaced Q with D (DevAdoption), M (Mindshare) |
| 1.8 | Feb 19, 2026 | Added cross-model normalization for sparse data |
| 2.0 | Mar 15, 2026 | Weight calibration based on 28-day validation. S reduced, D/N increased. Signal system redesigned: added mean_reversion and trend_momentum, fixed momentum_breakout thresholds |

---

*AI Virality Index is built by AI Virality ProIndex. Data updated daily via automated ETL pipeline.*
*Contact: getdroneservices@gmail.com*
