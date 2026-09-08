-- ============================================================================
-- 0004_fix_rls_and_realtime.sql
--
-- Fixes:
--   1. Enable REPLICA IDENTITY FULL on tables used with Supabase Realtime.
--      Without this, INSERT events from postgres_changes may not carry the
--      full row payload needed by the NotificationBell and ChatThread
--      components (they subscribe to INSERT events and read payload.new.*).
--
--   2. Ensure the messages RLS select policy uses the helper function
--      correctly. The existing policy from 0001 uses is_thread_participant()
--      which is correct — this migration is a no-op re-assertion in case the
--      function was missing/dropped.
--
--   3. Re-assert the threads INSERT policy to confirm it allows either
--      participant to create the thread (covers the agent → patient DM flow
--      from agent/agents page where participant_a = agent, participant_b =
--      patient).
--
--   4. Add a SELECT policy for threads that explicitly allows a participant
--      to select a thread they are part of (belt-and-suspenders — the
--      existing policy from 0001 should cover this but naming it explicitly
--      helps debugging).
-- ============================================================================

-- ── 1. REPLICA IDENTITY FULL for Realtime ────────────────────────────────────
-- Required so Supabase Realtime INSERT/UPDATE events include the full row.
-- Safe to run multiple times (idempotent).
ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER TABLE messages      REPLICA IDENTITY FULL;
ALTER TABLE threads       REPLICA IDENTITY FULL;
ALTER TABLE bookings      REPLICA IDENTITY FULL;

-- ── 2. Re-create is_thread_participant helper (idempotent) ────────────────────
-- This function is used by the messages RLS policy. If it was ever dropped
-- or recreated incorrectly, this restores it.
CREATE OR REPLACE FUNCTION public.is_thread_participant(p_thread_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.threads t
    WHERE t.id = p_thread_id
      AND (t.participant_a = auth.uid() OR t.participant_b = auth.uid())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_thread_participant(uuid) TO authenticated;

-- ── 3. Ensure messages SELECT policy exists and is correct ───────────────────
DROP POLICY IF EXISTS "messages_select_participant" ON messages;
CREATE POLICY "messages_select_participant" ON messages
  FOR SELECT USING (public.is_thread_participant(thread_id));

-- ── 4. Ensure messages INSERT policy exists and is correct ───────────────────
DROP POLICY IF EXISTS "messages_insert_participant" ON messages;
CREATE POLICY "messages_insert_participant" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND public.is_thread_participant(thread_id)
  );

-- ── 5. Ensure threads SELECT policy exists ───────────────────────────────────
DROP POLICY IF EXISTS "threads_select_participant" ON threads;
CREATE POLICY "threads_select_participant" ON threads
  FOR SELECT USING (
    participant_a = auth.uid() OR participant_b = auth.uid()
  );

-- ── 6. Ensure threads INSERT policy exists ───────────────────────────────────
-- Allows either participant to create the thread.
-- In practice participant_a is always the creator (their auth.uid()),
-- so the participant_a check is sufficient, but both are allowed for
-- flexibility.
DROP POLICY IF EXISTS "threads_insert_participant" ON threads;
CREATE POLICY "threads_insert_participant" ON threads
  FOR INSERT WITH CHECK (
    participant_a = auth.uid() OR participant_b = auth.uid()
  );

-- ── 7. Ensure patient_requests SELECT policy allows agents to read ────────────
-- Agents (any authenticated user) must be able to read active patient_requests
-- to display them in the Patient Requests feed. The existing policy
-- "patient_requests_select_public" covers this, but we re-assert it here.
DROP POLICY IF EXISTS "patient_requests_select_public" ON patient_requests;
CREATE POLICY "patient_requests_select_public" ON patient_requests
  FOR SELECT TO authenticated
  USING (active = true OR patient_id = auth.uid());

-- ── 8. Ensure bookings SELECT policy allows participants ──────────────────────
DROP POLICY IF EXISTS "bookings_select_participant" ON bookings;
CREATE POLICY "bookings_select_participant" ON bookings
  FOR SELECT USING (
    patient_id = auth.uid() OR agent_id = auth.uid()
  );

