-- ============================================
-- Migration 006: Alerts System
-- Run in Supabase SQL Editor
-- ============================================

-- User alert configurations (Pro users only)
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    condition TEXT NOT NULL,
    threshold NUMERIC,
    mode TEXT DEFAULT 'trade',
    channel TEXT NOT NULL DEFAULT 'webhook',
    webhook_url TEXT,
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(is_active, user_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_user ON alert_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_alert ON alert_history(alert_id);

-- RLS
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alerts' AND policyname = 'Users can read own alerts') THEN
        CREATE POLICY "Users can read own alerts" ON alerts FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alerts' AND policyname = 'Users can insert own alerts') THEN
        CREATE POLICY "Users can insert own alerts" ON alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alerts' AND policyname = 'Users can update own alerts') THEN
        CREATE POLICY "Users can update own alerts" ON alerts FOR UPDATE USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alerts' AND policyname = 'Users can delete own alerts') THEN
        CREATE POLICY "Users can delete own alerts" ON alerts FOR DELETE USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alert_history' AND policyname = 'Users can read own alert history') THEN
        CREATE POLICY "Users can read own alert history" ON alert_history FOR SELECT USING (auth.uid() = user_id);
    END IF;
END $$;

-- Verify
SELECT 'alerts' as table_name, count(*) as rows FROM alerts
UNION ALL
SELECT 'alert_history', count(*) FROM alert_history;
