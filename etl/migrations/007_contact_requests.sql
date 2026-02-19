-- Migration: Create contact_requests table for enterprise contact form
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: only service_role can insert/read (no user-facing access)
ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;
