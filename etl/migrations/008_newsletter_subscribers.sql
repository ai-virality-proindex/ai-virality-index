-- Migration 008: Newsletter subscribers table
-- Phase 12.1: Email capture for newsletter/weekly digest

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL DEFAULT 'landing',
    subscribed_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN DEFAULT true
);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_active ON newsletter_subscribers(is_active) WHERE is_active = true;
