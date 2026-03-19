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

### Added
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
