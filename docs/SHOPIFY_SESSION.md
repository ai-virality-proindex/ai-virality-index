# Shopify Project — Session Resume Document

> **This file is SEPARATE from the AI Virality Index project.**
> It documents the Shopify store setup for `stavery-2.myshopify.com`.

---

## Project Overview

**Store:** stavery-2.myshopify.com
**Shopify App:** "MCP Admin" (created in Shopify Partner Dashboard)

---

## Background & Goal

Пользователь уехал в поездку на ~2 недели **без ПК** (только iPad). Домашний ПК
включён, но недоступен — случайно отключил WiFi через TeamViewer. Поэтому вся работа
ведётся через Claude Code на планшете.

**Ситуация с темами:**
- На Shopify есть **кастомная тема**, созданная ранее с PC через Claude. В ней правильная
  структура сайта и тексты, но она **не редактируется через Shopify UI** — кривая разметка,
  кастомные секции не распознаются визуальным редактором.
- Пользователь создал **новую стандартную тему** на Shopify, которая нормально
  редактируется через UI.

**Главная задача:** Claude подключается к Shopify через MCP и **переносит контент**
(тексты, структуру страниц) с кастомной темы на новую стандартную тему. Переносятся
только данные/тексты — сами блоки и секции новой темы не трогаем, используем
стандартные блоки новой темы.

**Почему Claude, а не вручную:** С iPad редактировать тему долго и неудобно. Claude
через MCP API может читать и менять тему программно — это быстрее и точнее.

**Ситуация с GitHub:**
- Новый GitHub аккаунт (для Shopify) не удаётся подключить — глючит.
- Старый аккаунт `ai-virality-proindex` — нет доступа с мобильного (2FA шлёт код на
  старый номер телефона, который уже не работает).
- **Временное решение:** используем текущий репо `ai-virality-proindex/ai-virality-index`,
  но Shopify файлы хранятся **строго отдельно** в `shopify-theme/` и `docs/SHOPIFY_SESSION.md`.
- Когда доступ к ПК восстановится — перенесём всё на отдельный Shopify-репо.

**Дедлайн:** ~2 недели (до возвращения домой). Магазин должен быть готов.

---

## Credentials

> **Secrets are stored in `~/.claude.json` (MCP server config) and NOT in this repo.**
> See `claude mcp list` or `~/.claude.json` → `mcpServers.shopify` for actual values.

| Key            | Value                                      | Notes                          |
|----------------|--------------------------------------------|--------------------------------|
| Store domain   | `stavery-2.myshopify.com`                  |                                |
| Client ID      | `af7bbf58...` (see ~/.claude.json)         | OAuth app                      |
| Client Secret  | `shpss_...` (see ~/.claude.json)           | **DO NOT commit to repo**      |
| Access Token   | `shpat_...` (see ~/.claude.json)           | **Temporary, 24h** — may need refresh |

---

## MCP Servers (configured in ~/.claude.json)

### 1. shopify-mcp — Store Management + Themes

```bash
claude mcp add shopify --scope user -- npx -y shopify-mcp \
  --clientId <YOUR_CLIENT_ID> \
  --clientSecret <YOUR_CLIENT_SECRET> \
  --domain stavery-2.myshopify.com
```

- Access to Shopify Admin API: products, orders, customers, **themes**
- Supports OAuth client credentials (auto-refresh token)

### 2. @shopify/dev-mcp — Dev Guidance

```bash
claude mcp add shopify-dev --scope user -- npx -y @shopify/dev-mcp@latest
```

- Helps with Liquid templates, API schemas, code validation
- No token required

### Status: Both servers ADDED to `~/.claude.json` (user scope)

---

## What's Been Done

| Step | Status | Details |
|------|--------|---------|
| Create Shopify app "MCP Admin" | ✅ | In Partner Dashboard, OAuth client credentials flow |
| Obtain access token | ✅ | Via OAuth, temporary 24h |
| Add `shopify-mcp` server | ✅ | `claude mcp add shopify ...` |
| Add `@shopify/dev-mcp` server | ✅ | `claude mcp add shopify-dev ...` |
| Verify servers (`claude mcp list`) | ❌ | Not yet tested in fresh session |
| Test API connection to store | ❌ | Not yet tested |
| Deploy hero.liquid to Shopify theme | ❌ | File exists on branch, not deployed |

---

## Existing Theme Work

**Branch:** `claude/shopify-theme-setup-ZlPXn`
**File:** `shopify-theme/sections/hero.liquid` (1591 lines)
**Commit:** `1725067` — "feat: add horizontal button layout settings to hero section"

This is a Liquid template for a hero section with:
- Horizontal/vertical button layout settings
- Gap and equal-width button options
- Full Shopify section schema

---

## Resume Prompt (copy-paste into new Claude Code session)

```
Project path: /home/user/ai-virality-index
Read: docs/SHOPIFY_SESSION.md

## Shopify Store Project (SEPARATE from AI Virality Index)

Store: stavery-2.myshopify.com
App: "MCP Admin" (Partner Dashboard)

### Context
Пользователь в поездке ~2 нед. без ПК (только iPad). Нужно подготовить Shopify магазин.
На Shopify есть кастомная тема (с правильным контентом, но кривой разметкой — не
редактируется через UI) и новая стандартная тема (редактируется нормально).

ЗАДАЧА: Через MCP подключиться к Shopify, прочитать контент из кастомной темы и
перенести тексты/структуру в новую стандартную тему. Блоки и секции новой темы
не трогать — использовать стандартные, только заполнить контентом.

### Credentials
- Stored in ~/.claude.json (mcpServers.shopify section)
- Access token is temporary (24h) — may need refresh via OAuth client credentials flow

### MCP Servers (already added to ~/.claude.json, user scope)
1. shopify-mcp — store management + themes (Admin API)
2. @shopify/dev-mcp — Liquid/API dev guidance (no token)

### What's done
- MCP servers added via `claude mcp add`
- hero.liquid template exists on branch `claude/shopify-theme-setup-ZlPXn`

### What's next
1. Run `claude mcp list` to verify both servers loaded
2. Test connection: fetch store info via shopify-mcp
3. List themes — find кастомная (source) and новая стандартная (target)
4. Read content from кастомная тема
5. Transfer content to новая стандартная тема
6. Continue building out the store

### Important
- This is a SEPARATE project from AI Virality Index — do NOT mix
- Shopify theme files go in `shopify-theme/` directory
- Временно используем репо ai-virality-proindex — потом перенесём
- Full docs: docs/SHOPIFY_SESSION.md
```

---

## Next Steps

1. **Restart Claude Code** — MCP servers load on startup
2. **Verify:** `claude mcp list` — both `shopify` and `shopify-dev` should appear
3. **Test:** Make a simple API call (e.g., get shop info) to confirm the token works
4. **If token expired:** Re-generate via OAuth client credentials flow
5. **Deploy theme:** Push `hero.liquid` to the live Shopify theme via Admin API
6. **Continue:** Build out remaining theme sections
