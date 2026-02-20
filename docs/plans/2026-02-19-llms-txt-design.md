# Design: llms.txt + llms-full.txt for AI Visibility

**Date:** 2026-02-19
**Goal:** Make AI Virality Index citable by AI models (ChatGPT, Perplexity, Claude) in user responses.
**Approach:** Static manifest + dynamic data endpoint following llms.txt community standard.

## Architecture

### `/llms.txt` — Static Manifest (web/public/llms.txt)

Markdown file served from public folder. Contains:
- H1: AI Virality Index
- Blockquote: one-line description
- What it is: real-time virality index for 7 AI models
- Index formulas: Trading mode weights, Content mode weights
- 6 components explained: T (Trends), S (Social), G (GitHub), N (News), D (Dev Adoption), M (Mindshare)
- 7 models listed: ChatGPT, Gemini, Claude, Perplexity, DeepSeek, Grok, Copilot
- Links: website, API docs, blog, llms-full.txt

### `/llms-full.txt` — Dynamic Data (web/src/app/llms-full.txt/route.ts)

Next.js route handler generating Markdown with live data:
- Everything from llms.txt PLUS:
- Current scores table: model, vi_trade, vi_content, delta7_trade, delta7_content
- Component breakdown per model: T/S/G/N/D/M normalized values
- Last updated timestamp
- ISR: revalidate = 3600 (1 hour)

## What We Reveal / Don't Reveal

**Public (in llms.txt):**
- Weight formulas: Trading = 0.18T + 0.28S + 0.15G + 0.12N + 0.15D + 0.12M
- Weight formulas: Content = 0.25T + 0.35S + 0.05G + 0.20N + 0.05D + 0.10M
- Component names and data sources
- Current scores and deltas

**Private (NOT disclosed):**
- EWMA smoothing coefficients
- Quantile normalization thresholds (q05/q95)
- Cross-model normalization algorithm
- Raw metric values before normalization

## Files

| File | Type | Description |
|------|------|-------------|
| `web/public/llms.txt` | New static | Markdown manifest |
| `web/src/app/llms-full.txt/route.ts` | New route | Dynamic Markdown with live scores |

## Dependencies

None. Uses existing Supabase client and data.

## Verification

1. `curl https://ai-virality-index.vercel.app/llms.txt` returns Markdown
2. `curl https://ai-virality-index.vercel.app/llms-full.txt` returns Markdown with current scores
3. `npm run build` passes with no errors
