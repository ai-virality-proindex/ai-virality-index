# AI Virality Index

## Project
Real-time AI model virality index (0-100). Two modes: Trading + Content.
Full spec: docs/TECHNICAL_SPEC.md

## Tech Stack
- ETL: Python 3.11, pytrends, PRAW, google-api-python-client, GDELT
- Web: Next.js 14, TypeScript, Tailwind CSS, Recharts
- DB: Supabase (PostgreSQL + Auth)
- Cache: Upstash Redis
- Payments: Stripe
- Hosting: Vercel + Cloudflare
- CI/CD: GitHub Actions

## Key Files
- etl/main.py — ETL orchestrator (fetch + calculate + signals)
- etl/processing/index_calculator.py — core index math
- etl/models_config.yaml — model aliases dictionary
- web/src/app/api/v1/ — API routes
- web/src/app/dashboard/ — main dashboard

## Conventions
- Python: snake_case, type hints, docstrings
- TypeScript: camelCase, Zod on API inputs
- API responses: { data, meta } or { error: { code, message } }
- DB: Supabase, service_role key for ETL, anon key for frontend

## Index Formula
- Trading: 0.20*T + 0.20*S + 0.15*G + 0.10*N + 0.20*Q + 0.15*M
- Content: 0.28*T + 0.32*S + 0.08*G + 0.20*N + 0.05*Q + 0.07*M
- Normalization: Rolling quantile q05/q95 + Winsorize + EWMA
- 7 models: chatgpt, gemini, claude, perplexity, deepseek, grok, copilot

## Session Rules (MANDATORY)
1. After completing each task: update docs/PROMPTS_AND_CHECKLIST.md (mark ✅ with date + "What was done")
2. After completing each task: update docs/roadmap.html (change task icon, update progress bar %, update phase badge)
3. **Context management**: When you detect that context is running low (conversation is getting long, >50% of context used), you MUST:
   - Warn the user: "Context is getting full. I recommend starting a new session."
   - Provide a RESUME PROMPT — a ready-to-paste block containing:
     - Project path
     - All completed tasks with brief descriptions
     - Current task (what's in progress or next)
     - Python/Node paths
     - Links to TECHNICAL_SPEC.md and PROMPTS_AND_CHECKLIST.md
     - These session rules
   - The user will paste this RESUME PROMPT into a new Claude Code session to continue seamlessly
4. Checklist: docs/PROMPTS_AND_CHECKLIST.md
5. Roadmap: docs/roadmap.html
