-- ============================================
-- AI Virality Index — Database Schema
-- Run this in Supabase SQL Editor (supabase.com -> SQL Editor -> New query)
-- ============================================

-- ============================================
-- 1. CORE TABLES
-- ============================================

-- Models table
CREATE TABLE IF NOT EXISTS models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    company TEXT NOT NULL,
    logo_url TEXT,
    color TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Model aliases (search queries, repos, subreddits, etc.)
CREATE TABLE IF NOT EXISTS model_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    alias_type TEXT NOT NULL,
    alias_value TEXT NOT NULL,
    UNIQUE(model_id, alias_type, alias_value)
);

-- ============================================
-- 2. DATA TABLES
-- ============================================

-- Raw metrics (one row per model per source per metric per day)
CREATE TABLE IF NOT EXISTS raw_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    source TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value NUMERIC NOT NULL,
    raw_json JSONB,
    fetched_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(model_id, date, source, metric_name)
);

-- Normalized component scores (0-100)
CREATE TABLE IF NOT EXISTS component_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    component TEXT NOT NULL,
    raw_value NUMERIC,
    normalized_value NUMERIC NOT NULL,
    smoothed_value NUMERIC,
    UNIQUE(model_id, date, component)
);

-- Daily composite index
CREATE TABLE IF NOT EXISTS daily_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    vi_trade NUMERIC NOT NULL,
    vi_content NUMERIC NOT NULL,
    signal_trade NUMERIC,
    heat_content NUMERIC,
    delta7_trade NUMERIC,
    delta7_content NUMERIC,
    accel_trade NUMERIC,
    accel_content NUMERIC,
    component_breakdown JSONB,
    UNIQUE(model_id, date)
);

-- Arbitrage/divergence signals
CREATE TABLE IF NOT EXISTS signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    signal_type TEXT NOT NULL,
    direction TEXT,
    strength NUMERIC,
    vi_trade NUMERIC,
    polymarket_odds NUMERIC,
    divergence_score NUMERIC,
    reasoning TEXT,
    expires_at DATE,
    UNIQUE(model_id, date, signal_type)
);

-- ============================================
-- 3. USER TABLES
-- ============================================

-- User profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    plan TEXT DEFAULT 'free',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    api_calls_today INTEGER DEFAULT 0,
    api_calls_reset_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_raw_metrics_model_date ON raw_metrics(model_id, date);
CREATE INDEX IF NOT EXISTS idx_raw_metrics_source ON raw_metrics(source, date);
CREATE INDEX IF NOT EXISTS idx_raw_metrics_lookup ON raw_metrics(model_id, source, metric_name, date);
CREATE INDEX IF NOT EXISTS idx_component_scores_model_date ON component_scores(model_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_scores_model_date ON daily_scores(model_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_scores_date ON daily_scores(date);
CREATE INDEX IF NOT EXISTS idx_signals_date ON signals(date);
CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(signal_type, date);
CREATE INDEX IF NOT EXISTS idx_model_aliases_model ON model_aliases(model_id);
CREATE INDEX IF NOT EXISTS idx_model_aliases_type ON model_aliases(alias_type);

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can read own profile
CREATE POLICY "Users can read own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

-- Users can update own profile
CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Users can read own API keys
CREATE POLICY "Users can read own API keys" ON api_keys
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert own API keys
CREATE POLICY "Users can insert own API keys" ON api_keys
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update own API keys (revoke)
CREATE POLICY "Users can update own API keys" ON api_keys
    FOR UPDATE USING (auth.uid() = user_id);

-- Public tables: allow read for everyone (data is public)
-- No RLS needed on models, raw_metrics, daily_scores, etc.

-- ============================================
-- 6. SEED DATA: MODELS
-- ============================================

INSERT INTO models (slug, name, company, color) VALUES
    ('chatgpt',    'ChatGPT',    'OpenAI',        '#10A37F'),
    ('gemini',     'Gemini',     'Google',         '#4285F4'),
    ('claude',     'Claude',     'Anthropic',      '#D4A574'),
    ('perplexity', 'Perplexity', 'Perplexity AI',  '#20B2AA'),
    ('deepseek',   'DeepSeek',   'DeepSeek',       '#0066FF'),
    ('grok',       'Grok',       'xAI',            '#1DA1F2'),
    ('copilot',    'Copilot',    'Microsoft',      '#9B59B6')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 7. SEED DATA: MODEL ALIASES
-- ============================================

-- ChatGPT aliases
INSERT INTO model_aliases (model_id, alias_type, alias_value)
SELECT id, alias_type, alias_value FROM models
CROSS JOIN (VALUES
    ('search_query', 'ChatGPT'),
    ('search_query', 'GPT-4'),
    ('search_query', 'GPT-4o'),
    ('search_query', 'GPT-5'),
    ('search_query', 'OpenAI ChatGPT'),
    ('github_repo', 'openai/openai-python'),
    ('github_repo', 'openai/openai-node'),
    ('subreddit', 'ChatGPT'),
    ('gdelt_query', 'ChatGPT'),
    ('gdelt_query', 'OpenAI GPT'),
    ('arena_name', 'GPT-4o')
) AS aliases(alias_type, alias_value)
WHERE models.slug = 'chatgpt'
ON CONFLICT (model_id, alias_type, alias_value) DO NOTHING;

-- Gemini aliases
INSERT INTO model_aliases (model_id, alias_type, alias_value)
SELECT id, alias_type, alias_value FROM models
CROSS JOIN (VALUES
    ('search_query', 'Gemini AI'),
    ('search_query', 'Google Gemini'),
    ('search_query', 'Gemini 2'),
    ('search_query', 'Gemini 2.5'),
    ('github_repo', 'google/generative-ai-python'),
    ('github_repo', 'google/generative-ai-js'),
    ('subreddit', 'Bard'),
    ('gdelt_query', 'Google Gemini'),
    ('gdelt_query', 'Gemini AI'),
    ('arena_name', 'Gemini')
) AS aliases(alias_type, alias_value)
WHERE models.slug = 'gemini'
ON CONFLICT (model_id, alias_type, alias_value) DO NOTHING;

-- Claude aliases
INSERT INTO model_aliases (model_id, alias_type, alias_value)
SELECT id, alias_type, alias_value FROM models
CROSS JOIN (VALUES
    ('search_query', 'Claude AI'),
    ('search_query', 'Claude 4'),
    ('search_query', 'Anthropic Claude'),
    ('search_query', 'Claude Sonnet'),
    ('github_repo', 'anthropics/anthropic-sdk-python'),
    ('github_repo', 'anthropics/anthropic-sdk-typescript'),
    ('subreddit', 'ClaudeAI'),
    ('gdelt_query', 'Anthropic Claude'),
    ('gdelt_query', 'Claude AI'),
    ('arena_name', 'Claude')
) AS aliases(alias_type, alias_value)
WHERE models.slug = 'claude'
ON CONFLICT (model_id, alias_type, alias_value) DO NOTHING;

-- Perplexity aliases
INSERT INTO model_aliases (model_id, alias_type, alias_value)
SELECT id, alias_type, alias_value FROM models
CROSS JOIN (VALUES
    ('search_query', 'Perplexity AI'),
    ('search_query', 'Perplexity'),
    ('subreddit', 'perplexity_ai'),
    ('gdelt_query', 'Perplexity AI'),
    ('arena_name', 'Perplexity')
) AS aliases(alias_type, alias_value)
WHERE models.slug = 'perplexity'
ON CONFLICT (model_id, alias_type, alias_value) DO NOTHING;

-- DeepSeek aliases
INSERT INTO model_aliases (model_id, alias_type, alias_value)
SELECT id, alias_type, alias_value FROM models
CROSS JOIN (VALUES
    ('search_query', 'DeepSeek'),
    ('search_query', 'DeepSeek R1'),
    ('search_query', 'DeepSeek V3'),
    ('github_repo', 'deepseek-ai/DeepSeek-V3'),
    ('github_repo', 'deepseek-ai/DeepSeek-R1'),
    ('subreddit', 'DeepSeek'),
    ('gdelt_query', 'DeepSeek AI'),
    ('gdelt_query', 'DeepSeek'),
    ('arena_name', 'DeepSeek')
) AS aliases(alias_type, alias_value)
WHERE models.slug = 'deepseek'
ON CONFLICT (model_id, alias_type, alias_value) DO NOTHING;

-- Grok aliases
INSERT INTO model_aliases (model_id, alias_type, alias_value)
SELECT id, alias_type, alias_value FROM models
CROSS JOIN (VALUES
    ('search_query', 'Grok AI'),
    ('search_query', 'xAI Grok'),
    ('search_query', 'Grok 3'),
    ('github_repo', 'xai-org/grok-1'),
    ('subreddit', 'grok'),
    ('gdelt_query', 'Grok AI'),
    ('gdelt_query', 'xAI Grok'),
    ('arena_name', 'Grok')
) AS aliases(alias_type, alias_value)
WHERE models.slug = 'grok'
ON CONFLICT (model_id, alias_type, alias_value) DO NOTHING;

-- Copilot aliases
INSERT INTO model_aliases (model_id, alias_type, alias_value)
SELECT id, alias_type, alias_value FROM models
CROSS JOIN (VALUES
    ('search_query', 'GitHub Copilot'),
    ('search_query', 'Microsoft Copilot'),
    ('search_query', 'Copilot AI'),
    ('subreddit', 'MicrosoftCopilot'),
    ('gdelt_query', 'Microsoft Copilot'),
    ('gdelt_query', 'GitHub Copilot'),
    ('arena_name', 'Copilot')
) AS aliases(alias_type, alias_value)
WHERE models.slug = 'copilot'
ON CONFLICT (model_id, alias_type, alias_value) DO NOTHING;

-- ============================================
-- 8. ALERTS SYSTEM
-- ============================================

-- User alert configurations (Pro users only)
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    condition TEXT NOT NULL,          -- 'vi_above', 'vi_below', 'delta7_above', 'delta7_below', 'new_signal'
    threshold NUMERIC,               -- Threshold value (NULL for 'new_signal')
    mode TEXT DEFAULT 'trade',       -- 'trade' or 'content'
    channel TEXT NOT NULL DEFAULT 'webhook', -- 'email', 'webhook'
    webhook_url TEXT,                -- Webhook URL (if channel='webhook')
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Alert notification history
CREATE TABLE IF NOT EXISTS alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    condition TEXT NOT NULL,
    triggered_value NUMERIC,
    threshold NUMERIC,
    message TEXT NOT NULL,
    delivered BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for alerts
CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(is_active, user_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_user ON alert_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_alert ON alert_history(alert_id);

-- RLS for alerts
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own alerts" ON alerts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alerts" ON alerts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts" ON alerts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own alerts" ON alerts
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can read own alert history" ON alert_history
    FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- DONE! Verify with:
-- SELECT * FROM models;
-- SELECT m.slug, ma.alias_type, ma.alias_value FROM model_aliases ma JOIN models m ON ma.model_id = m.id ORDER BY m.slug, ma.alias_type;
-- ============================================
