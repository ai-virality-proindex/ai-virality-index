# Shopify Project — Session Resume Document

> **This file is SEPARATE from the AI Virality Index project.**
> It documents the Shopify store setup for `stavery-2.myshopify.com`.

---

## Project Overview

**Store:** stavery-2.myshopify.com
**Shopify App:** "MCP Admin" (created in Shopify Partner Dashboard)
**Goal:** Connect Claude Code to Shopify via MCP servers to manage theme and store.

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
1. Restart Claude Code so MCP servers load
2. Run `claude mcp list` to verify both servers
3. Test connection: fetch store info via shopify-mcp
4. Deploy hero.liquid to the live Shopify theme
5. Continue theme development

### Important
- This is a SEPARATE project from AI Virality Index
- Do NOT mix Shopify work with AI Virality Index files
- Shopify theme files go in `shopify-theme/` directory
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
