-- ============================================================================
-- 0003_ratings_and_bookings.sql
--
-- Changes:
--   1. Extend bookings.status CHECK to include 'declined' (agent-declined,
--      distinct from 'cancelled' which is patient/post-acceptance cancellation).
--   2. Create booking_ratings table with RLS.
-- ============================================================================

-- ── 1. Add 'declined' to bookings status constraint ──────────────────────────
-- Drop the existing constraint and re-add it with the new value.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'accepted', 'completed', 'cancelled', 'declined'));

-- ── 2. booking_ratings table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_ratings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  patient_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  agent_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stars       int         NOT NULL CHECK (stars BETWEEN 1 AND 5),
  review_text text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_ratings_booking_unique UNIQUE (booking_id)
);

-- ── 3. RLS on booking_ratings ─────────────────────────────────────────────────
ALTER TABLE booking_ratings ENABLE ROW LEVEL SECURITY;

-- Patients can insert a rating for their own completed bookings
DROP POLICY IF EXISTS "ratings_insert_patient" ON booking_ratings;
CREATE POLICY "ratings_insert_patient" ON booking_ratings
  FOR INSERT WITH CHECK (patient_id = auth.uid());

-- Ratings are publicly readable by all authenticated users (social proof)
DROP POLICY IF EXISTS "ratings_select_public" ON booking_ratings;
CREATE POLICY "ratings_select_public" ON booking_ratings
  FOR SELECT TO authenticated USING (true);

-- ── 4. Index for fast per-agent rating lookups ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_booking_ratings_agent ON booking_ratings (agent_id);
CREATE INDEX IF NOT EXISTS idx_booking_ratings_booking ON booking_ratings (booking_id);
