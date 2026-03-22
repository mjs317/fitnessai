-- ============================================================
-- MIGRATION: add columns that are referenced in code but may
-- be missing from an older production database.
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Apple Health webhook columns
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS apple_health_webhook_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS apple_health_last_sync      TIMESTAMPTZ;

-- Garmin session cookies (OAuth token cache)
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS garmin_session_cookies TEXT;

-- Done.
