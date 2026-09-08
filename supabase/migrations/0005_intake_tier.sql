-- ============================================================================
-- 0005_intake_tier.sql
--
-- Adds tier and fallback tracking to intake_records.
--
-- Changes:
--   1. Add `tier` column ('low' | 'high') to intake_records so the history
--      page can show which model tier was used for each session.
--   2. Add `fallback_occurred` boolean so the history page can flag sessions
--      where Kimi K3 failed and fell back to Groq mid-session.
--   3. Add `recommended_department` text column so the history page can show
--      the AI's department recommendation without parsing structured_data.
--
-- Safe to run against existing data — all columns are nullable/defaulted.
-- ============================================================================

-- ── 1. tier column ────────────────────────────────────────────────────────────
ALTER TABLE intake_records
  ADD COLUMN IF NOT EXISTS tier text
  CHECK (tier IN ('low', 'high'));

-- Backfill existing rows as 'low' (all were Groq before this migration)
UPDATE intake_records SET tier = 'low' WHERE tier IS NULL;

-- ── 2. fallback_occurred column ───────────────────────────────────────────────
ALTER TABLE intake_records
  ADD COLUMN IF NOT EXISTS fallback_occurred boolean NOT NULL DEFAULT false;

-- ── 3. recommended_department column ─────────────────────────────────────────
ALTER TABLE intake_records
  ADD COLUMN IF NOT EXISTS recommended_department text;

-- ── 4. Index on patient_id + created_at for history page query ───────────────
-- The existing idx_intake_patient covers patient_id. Adding created_at to
-- speed up ORDER BY on the history list.
DROP INDEX IF EXISTS idx_intake_patient_date;
CREATE INDEX IF NOT EXISTS idx_intake_patient_date
  ON intake_records (patient_id, created_at DESC);
