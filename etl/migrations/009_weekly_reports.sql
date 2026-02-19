-- Migration 009: Weekly reports table
-- Phase 12.8: Stores weekly snapshot data for PDF report generation

CREATE TABLE IF NOT EXISTS weekly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_date DATE UNIQUE NOT NULL,
    data_snapshot JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_weekly_reports_date ON weekly_reports(week_date DESC);
