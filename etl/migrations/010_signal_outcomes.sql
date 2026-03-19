-- Signal Outcomes table for accuracy tracking (v0.2)
-- Tracks whether signals were correct after their expiry period

CREATE TABLE IF NOT EXISTS signal_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    signal_date DATE NOT NULL,
    outcome_date DATE NOT NULL,
    was_correct BOOLEAN NOT NULL,
    vi_at_signal NUMERIC(6,2),
    vi_at_outcome NUMERIC(6,2),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(signal_id)
);

-- Index for rolling accuracy queries
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_date ON signal_outcomes(outcome_date);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_correct ON signal_outcomes(outcome_date, was_correct);

-- RLS
ALTER TABLE signal_outcomes ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on signal_outcomes"
    ON signal_outcomes
    FOR ALL
    USING (auth.role() = 'service_role');

-- Allow authenticated users to read
CREATE POLICY "Authenticated read signal_outcomes"
    ON signal_outcomes
    FOR SELECT
    USING (auth.role() = 'authenticated');
