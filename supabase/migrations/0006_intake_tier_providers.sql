-- ============================================================================
-- 0006_intake_tier_providers.sql
--
-- Widens the intake_records.tier check constraint.
--
-- Why: 0005 constrained tier to ('low', 'high'). The AI architecture now
-- stores provider IDs instead ('minimax-m3' | 'gemini' | 'groq'), so inserts
-- with those values violated intake_records_tier_check and report generation
-- failed with a 500.
--
-- This migration replaces the constraint to accept:
--   - legacy values: 'low', 'high' (existing rows)
--   - provider IDs:  'minimax-m3', 'gemini', 'groq'
-- ============================================================================

ALTER TABLE intake_records
  DROP CONSTRAINT IF EXISTS intake_records_tier_check;

ALTER TABLE intake_records
  ADD CONSTRAINT intake_records_tier_check
  CHECK (tier IN ('low', 'high', 'minimax-m3', 'gemini', 'groq'));
