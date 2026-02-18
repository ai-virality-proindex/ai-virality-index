-- Migration 007: Polymarket Trainer — sim_bets table
-- Virtual prediction market for practicing AVI-based trading

CREATE TABLE IF NOT EXISTS sim_bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,

    -- Bet parameters
    direction TEXT NOT NULL,               -- 'above' or 'below'
    threshold NUMERIC NOT NULL,            -- target index value (0-100)
    timeframe_days INTEGER NOT NULL,       -- 1, 3, 7, or 14
    bet_amount NUMERIC NOT NULL,           -- $10-$500

    -- Odds & payout
    odds NUMERIC NOT NULL,                 -- payout multiplier (e.g. 2.5)
    implied_probability NUMERIC NOT NULL,  -- 1/odds adjusted
    potential_payout NUMERIC NOT NULL,      -- bet_amount * odds

    -- Snapshot at bet time
    index_at_bet NUMERIC NOT NULL,         -- VI_trade when bet was placed
    volatility_at_bet NUMERIC,             -- historical vol used for odds

    -- Resolution
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'won', 'lost'
    index_at_resolution NUMERIC,           -- VI_trade on expiry date
    payout NUMERIC NOT NULL DEFAULT 0,     -- 0 if lost, potential_payout if won
    resolved_at TIMESTAMPTZ,

    -- Metadata
    placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at DATE NOT NULL,              -- date when bet resolves

    -- Constraints
    CONSTRAINT chk_direction CHECK (direction IN ('above', 'below')),
    CONSTRAINT chk_timeframe CHECK (timeframe_days IN (1, 3, 7, 14)),
    CONSTRAINT chk_amount CHECK (bet_amount >= 10 AND bet_amount <= 500),
    CONSTRAINT chk_status CHECK (status IN ('active', 'won', 'lost'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sim_bets_user_id ON sim_bets(user_id);
CREATE INDEX IF NOT EXISTS idx_sim_bets_active_expires ON sim_bets(expires_at) WHERE status = 'active';

-- RLS
ALTER TABLE sim_bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own bets"
    ON sim_bets FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bets"
    ON sim_bets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Service role (ETL) can update bets for resolution — no policy needed,
-- service_role key bypasses RLS.
