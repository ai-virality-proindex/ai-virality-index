# Changelog

## v0.2.0 (2026-03-19)

### Breaking Changes
- **Single index**: Removed Trading/Content dual-mode system (92.4% correlated, effectively identical)
- **Pricing**: Pro Trader ($29) + Pro Builder ($99) replaced with Pro ($19) + Team ($79)
- **Signals API**: Pro-gate removed, signals endpoint now free for all users

### Changed
- Landing page: removed "Two Modes, One Index" section
- Dashboard/Compare/Model pages: removed mode toggle, show single VI score
- "Trading Signals" renamed to "Notable Changes" (descriptive, not predictive)
- "bullish"/"bearish" labels replaced with "rising"/"declining"
- Index components: 6 -> 5 displayed (D/Dev Adoption removed from display)
- G component label: "Developer Adoption" -> "GitHub Activity"
- Signals API: added disclaimer in meta field
- Version shown in footer

### Formula
- Single 5-component formula: `VI = 0.25T + 0.25S + 0.10G + 0.25N + 0.15M`
- D (Dev Adoption) dropped from weighted sum (45% zeros, 4/7 models have no SDK)
- D data still collected and stored in component_scores for reference
- EWMA smoothing unified to α=0.30 (was 0.35/0.25 for trade/content)
- Weight redistribution: G weight (not D) redistributed for models without GitHub
- `vi_trade = vi_content = VI` in database for backward compatibility

### Signals
- Complete rewrite: 3 descriptive types replace 4 predictive types
  - `spike`: VI rose >1.5σ over 7 days (direction: "rising")
  - `drop`: VI fell >1.5σ over 7 days (direction: "declining")
  - `rank_change`: model moved ≥2 rank positions over 7 days
- No financial language (bullish/bearish removed)

### Added
- Accuracy tracker (`etl/processing/accuracy_tracker.py`) — tracks signal outcomes after 7 days
- `signal_outcomes` table migration (`etl/migrations/010_signal_outcomes.sql`)
- Git tags: v0.1.0 (baseline), v0.2.0 (this release)
- CHANGELOG.md

## v0.1.0 (2026-03-19)

Baseline release. 32 days of data collection, 6 components (T/S/G/N/D/M),
dual Trading/Content modes, 3 pricing tiers (Free/$29/$99).

Known issues at this version:
- Signals accuracy: 48.1% (coin flip)
- D component: 45% zeros (4/7 models have no SDK)
- G component: 37% zeros (Copilot/Perplexity = 0)
- Two modes: 92.4% correlated
