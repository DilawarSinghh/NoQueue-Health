-- ============================================================================
-- ALL_MIGRATIONS.sql — NoQueue Health (Scriba) — full database setup
--
-- ⚠️  RUN THIS ONCE, IN ORDER, IN THE SUPABASE SQL EDITOR.
--
-- This file concatenates migrations 0001 → 0006 in the correct order so you
-- can set up the entire database in a single run without version mismatch:
--
--   0001  Initial schema (tables, RLS, triggers, indexes, buckets)
--   0002  Hospital lockdown (Safdarjung — drops hospital cols, dept checks)
--   0003  Ratings + extended booking statuses
--   0004  RLS + Realtime fixes (replica identity, policies)
--   0005  intake_records: tier / fallback_occurred / recommended_department
--   0006  Widens tier check to provider IDs (minimax-m3, gemini, groq)
--
-- ⚠️  WARNING: 0001 DROPS the old intake_records table (cascade) and replaces
--     it. Running this on a database with real intake data will DESTROY that
--     data. For production upgrades, run the individual numbered migrations
--     you haven't applied yet instead of this file.
--
-- All statements are guarded (IF EXISTS / IF NOT EXISTS / drop-then-add
-- constraints), so re-running the whole file is safe apart from the 0001
-- intake_records drop above.
-- ============================================================================


-- ############################################################
-- BEGIN: 0001_initial_schema.sql
-- ############################################################

-- ============================================================================
-- Scriba — full marketplace schema (spec §2 + §3 + §5) and RLS policies (§9).
-- Supabase Postgres. Run once in the SQL Editor, or via `supabase db push`.
-- Rebuilds the old single-flow MVP: the old `intake_records` (camelCase patient
-- columns) is dropped and replaced by the new two-sided marketplace schema.
--
-- DECISION POINTS (flagged per spec §9 — confirm before continuing):
--   1. Contact masking: profiles.phone/email and agent_profiles.whatsapp_number
--      are SELF-ONLY via RLS. Public feeds render name/avatar/hospital/department
--      /rating through SERVER-SIDE API routes (service role) that select only
--      safe columns. WhatsApp numbers stay hidden until booking/DM engagement
--      (enforced in the API layer in Phase 4/5).
--   2. "Publicly readable" below = AUTHENTICATED users (feeds are behind auth).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Drop the old MVP table (incompatible columns — test data only).
-- ---------------------------------------------------------------------------
drop table if exists intake_records cascade;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- profiles: one public row per auth.users id (extends Supabase Auth).
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('agent', 'patient')),
  full_name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- agent_profiles: agent-only details.
create table if not exists agent_profiles (
  user_id uuid primary key references profiles (id) on delete cascade,
  hospital text,
  department text,
  experience_years int,
  bio text,
  whatsapp_number text,        -- SENSITIVE: self-only via RLS (see header note)
  rating numeric not null default 0,
  rating_count int not null default 0
);

-- patient_profiles: patient medical basics (spec §3 onboarding). Pre-fills the
-- AI intake so it never re-asks basics (spec §6).
create table if not exists patient_profiles (
  id uuid primary key references profiles (id) on delete cascade,
  gender text,
  age int,
  dob date,
  blood_group text,
  allergies text,
  chronic_conditions text,
  created_at timestamptz not null default now()
);

-- agent_posts: "I offer documentation help" listings.
create table if not exists agent_posts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references profiles (id) on delete cascade,
  title text not null,
  description text,
  price numeric not null,
  department text,
  hospital text,
  created_at timestamptz not null default now(),
  active boolean not null default true
);

-- patient_requests: "I need an agent" reverse listings.
create table if not exists patient_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references profiles (id) on delete cascade,
  department text,
  hospital text,
  price_offered numeric,
  min_rating numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  active boolean not null default true
);

-- bookings: a patient booking an agent's post.
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references agent_posts (id) on delete cascade,
  patient_id uuid references profiles (id) on delete cascade,
  agent_id uuid references profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

-- threads: a conversation (agent<->patient, or the site-wide assistant).
create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('agent_patient', 'site_assistant')),
  participant_a uuid references profiles (id) on delete cascade,
  participant_b uuid references profiles (id) on delete cascade, -- null for site_assistant
  created_at timestamptz not null default now()
);

-- messages: one row per chat message (agent<->patient DMs AND site assistant).
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads (id) on delete cascade,
  sender_id uuid references profiles (id) on delete cascade, -- null if AI assistant
  is_assistant boolean not null default false,
  content text not null,
  created_at timestamptz not null default now()
);

-- intake_records: AI intake results + generated reports.
create table if not exists intake_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references profiles (id) on delete cascade,
  structured_data jsonb not null,
  clinical_summary text,        -- AI-written summary for the doctor, NOT a diagnosis
  pdf_url text,
  created_at timestamptz not null default now()
);

-- notifications: lightweight in-app notifications (spec §5).
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Helper: is the current user a participant of a thread?
--    security invoker + schema-qualified table = no privilege escalation.
-- ---------------------------------------------------------------------------
create or replace function public.is_thread_participant(p_thread_id uuid)
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.threads t
    where t.id = p_thread_id
      and (t.participant_a = auth.uid() or t.participant_b = auth.uid())
  );
$$;
grant execute on function public.is_thread_participant(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Enable Row Level Security on every table.
-- ---------------------------------------------------------------------------
alter table profiles          enable row level security;
alter table agent_profiles    enable row level security;
alter table patient_profiles  enable row level security;
alter table agent_posts       enable row level security;
alter table patient_requests  enable row level security;
alter table bookings          enable row level security;
alter table threads           enable row level security;
alter table messages          enable row level security;
alter table intake_records    enable row level security;
alter table notifications     enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Policies (drop-if-exists + create = safe to re-run).
-- ---------------------------------------------------------------------------

-- profiles: read / insert / update own row only.
drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles for select using (id = auth.uid());
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles for insert with check (id = auth.uid());
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update using (id = auth.uid());

-- agent_profiles: own row only (whatsapp_number is sensitive — self only).
drop policy if exists "agent_profiles_select_own" on agent_profiles;
create policy "agent_profiles_select_own" on agent_profiles for select using (user_id = auth.uid());
drop policy if exists "agent_profiles_insert_own" on agent_profiles;
create policy "agent_profiles_insert_own" on agent_profiles for insert with check (user_id = auth.uid());
drop policy if exists "agent_profiles_update_own" on agent_profiles;
create policy "agent_profiles_update_own" on agent_profiles for update using (user_id = auth.uid());

-- patient_profiles: own row only.
drop policy if exists "patient_profiles_select_own" on patient_profiles;
create policy "patient_profiles_select_own" on patient_profiles for select using (id = auth.uid());
drop policy if exists "patient_profiles_insert_own" on patient_profiles;
create policy "patient_profiles_insert_own" on patient_profiles for insert with check (id = auth.uid());
drop policy if exists "patient_profiles_update_own" on patient_profiles;
create policy "patient_profiles_update_own" on patient_profiles for update using (id = auth.uid());

-- agent_posts: readable by authenticated users when active, writable by owner.
drop policy if exists "agent_posts_select_public" on agent_posts;
create policy "agent_posts_select_public" on agent_posts
  for select to authenticated using (active = true or agent_id = auth.uid());
drop policy if exists "agent_posts_insert_own" on agent_posts;
create policy "agent_posts_insert_own" on agent_posts for insert with check (agent_id = auth.uid());
drop policy if exists "agent_posts_update_own" on agent_posts;
create policy "agent_posts_update_own" on agent_posts for update using (agent_id = auth.uid());
drop policy if exists "agent_posts_delete_own" on agent_posts;
create policy "agent_posts_delete_own" on agent_posts for delete using (agent_id = auth.uid());

-- patient_requests: readable by authenticated users when active, writable by owner.
drop policy if exists "patient_requests_select_public" on patient_requests;
create policy "patient_requests_select_public" on patient_requests
  for select to authenticated using (active = true or patient_id = auth.uid());
drop policy if exists "patient_requests_insert_own" on patient_requests;
create policy "patient_requests_insert_own" on patient_requests for insert with check (patient_id = auth.uid());
drop policy if exists "patient_requests_update_own" on patient_requests;
create policy "patient_requests_update_own" on patient_requests for update using (patient_id = auth.uid());
drop policy if exists "patient_requests_delete_own" on patient_requests;
create policy "patient_requests_delete_own" on patient_requests for delete using (patient_id = auth.uid());

-- bookings: participants only. Patient creates; agent/patient update.
drop policy if exists "bookings_select_participant" on bookings;
create policy "bookings_select_participant" on bookings
  for select using (patient_id = auth.uid() or agent_id = auth.uid());
drop policy if exists "bookings_insert_patient" on bookings;
create policy "bookings_insert_patient" on bookings for insert with check (patient_id = auth.uid());
drop policy if exists "bookings_update_participant" on bookings;
create policy "bookings_update_participant" on bookings
  for update using (patient_id = auth.uid() or agent_id = auth.uid());

-- threads: participants only.
drop policy if exists "threads_select_participant" on threads;
create policy "threads_select_participant" on threads
  for select using (participant_a = auth.uid() or participant_b = auth.uid());
drop policy if exists "threads_insert_participant" on threads;
create policy "threads_insert_participant" on threads
  for insert with check (participant_a = auth.uid() or participant_b = auth.uid());
drop policy if exists "threads_update_participant" on threads;
create policy "threads_update_participant" on threads
  for update using (participant_a = auth.uid() or participant_b = auth.uid());

-- messages: participants only (assistant messages are inserted server-side via
-- the service role, which bypasses RLS).
drop policy if exists "messages_select_participant" on messages;
create policy "messages_select_participant" on messages
  for select using (public.is_thread_participant(thread_id));
drop policy if exists "messages_insert_participant" on messages;
create policy "messages_insert_participant" on messages
  for insert with check (sender_id = auth.uid() and public.is_thread_participant(thread_id));

-- intake_records: owning patient only (service role handles report generation).
drop policy if exists "intake_records_select_own" on intake_records;
create policy "intake_records_select_own" on intake_records for select using (patient_id = auth.uid());
drop policy if exists "intake_records_insert_own" on intake_records;
create policy "intake_records_insert_own" on intake_records for insert with check (patient_id = auth.uid());
drop policy if exists "intake_records_update_own" on intake_records;
create policy "intake_records_update_own" on intake_records for update using (patient_id = auth.uid());

-- notifications: owning user only.
drop policy if exists "notifications_select_own" on notifications;
create policy "notifications_select_own" on notifications for select using (user_id = auth.uid());
drop policy if exists "notifications_insert_own" on notifications;
create policy "notifications_insert_own" on notifications for insert with check (user_id = auth.uid());
drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own" on notifications for update using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Indexes (common query paths).
-- ---------------------------------------------------------------------------
create index if not exists idx_agent_posts_active      on agent_posts (active) where active = true;
create index if not exists idx_agent_posts_agent       on agent_posts (agent_id);
create index if not exists idx_agent_posts_dept_hosp   on agent_posts (department, hospital);
create index if not exists idx_patient_requests_active on patient_requests (active) where active = true;
create index if not exists idx_patient_requests_patient on patient_requests (patient_id);
create index if not exists idx_bookings_agent          on bookings (agent_id);
create index if not exists idx_bookings_patient        on bookings (patient_id);
create index if not exists idx_threads_a               on threads (participant_a);
create index if not exists idx_threads_b               on threads (participant_b);
create index if not exists idx_messages_thread         on messages (thread_id, created_at);
create index if not exists idx_notifications_user      on notifications (user_id, read);
create index if not exists idx_intake_patient          on intake_records (patient_id);

-- ---------------------------------------------------------------------------
-- 6. Storage buckets.
--    RLS is ALREADY enabled on storage.objects by default. The storage.objects
--    policies (avatars public read / owner-only write) can NOT be created here
--    as postgres — storage.objects is owned by supabase_storage_admin (error
--    42501). Create those policies later via the dashboard: Storage → Policies.
--    The app also creates the patient-pdfs bucket programmatically via the
--    service role, and will do the same for avatars in Phase 2.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('patient-pdfs', 'patient-pdfs', false)
  on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. RLS Verification Queries (spec §8 — run manually to confirm cross-user
--    access is blocked). Replace UUIDs with real test user IDs from auth.users.
-- ---------------------------------------------------------------------------
-- Test 1: profile isolation — should return 0 rows when run as user B
--   select * from profiles where id = '<user_A_id>';
--
-- Test 2: thread isolation — should return 0 rows when run as user C (not a participant)
--   select * from threads where id = '<thread_between_A_and_B>';
--
-- Test 3: messages isolation — should return 0 rows when run as user C
--   select * from messages where thread_id = '<thread_between_A_and_B>';
--
-- Test 4: intake_records isolation — should return 0 rows when run as any user other than the patient
--   select * from intake_records where patient_id = '<patient_A_id>';
--
-- Test 5: agent_profiles whatsapp isolation — should return 0 rows when run as any other user
--   select whatsapp_number from agent_profiles where user_id = '<agent_A_id>';
--
-- Test 6: notifications isolation — should return 0 rows for any other user
--   select * from notifications where user_id = '<user_A_id>';
--
-- All of the above should be run with the anon/authenticated role (not service_role).
-- In Supabase SQL Editor: use "Role: authenticated" in the run dropdown and set
-- auth.uid() by running: select set_config('request.jwt.claims', '{"sub":"<user_C_id>"}', true);


-- END: 0001_initial_schema.sql


-- ############################################################
-- BEGIN: 0002_hospital_lockdown.sql
-- ############################################################

-- ============================================================================
-- 0002_hospital_lockdown.sql
--
-- Single-hospital lock-in for Safdarjung Hospital deployment.
--
-- Changes:
--   1. Drop `hospital` column from agent_posts, patient_requests, agent_profiles.
--   2. Replace the old (department, hospital) composite index with dept-only.
--   3. Clear any freehand department values that don't match the official list
--      (converts them to NULL so the constraint can be added cleanly).
--   4. Add CHECK constraints on agent_profiles.department and
--      patient_requests.department — only official Safdarjung dept names allowed.
--
-- Fully idempotent: safe to re-run. All DROP operations use IF EXISTS.
-- ============================================================================

-- ── helpers: the allowed department list ─────────────────────────────────────
-- Defined once here so the UPDATE and ADD CONSTRAINT below stay in sync.

-- ── 1. agent_posts: remove hospital column ───────────────────────────────────
ALTER TABLE agent_posts DROP COLUMN IF EXISTS hospital;

DROP INDEX IF EXISTS idx_agent_posts_dept_hosp;
CREATE INDEX IF NOT EXISTS idx_agent_posts_dept ON agent_posts (department);

-- ── 2. patient_requests: remove hospital column ──────────────────────────────
ALTER TABLE patient_requests DROP COLUMN IF EXISTS hospital;

-- ── 3. agent_profiles: remove hospital column ────────────────────────────────
ALTER TABLE agent_profiles DROP COLUMN IF EXISTS hospital;

-- ── 4. Clean up any freehand department values before constraining ────────────
-- Any row whose department isn't in the official list gets set to NULL.
-- This covers test data typed during development.
UPDATE agent_profiles
SET department = NULL
WHERE department IS NOT NULL
  AND department <> ALL(ARRAY[
    'Anaesthesia and Intensive Care','Anatomy','Biochemistry',
    'Blood Centre and Transfusion Medicine','Burns, Plastic and Maxillofacial Surgery',
    'Cancer Surgery','Cardio Thoracic and Vascular Surgery (CTVS)','Cardiology',
    'Central Institute of Orthopaedics (CIO)','Community Medicine','Critical Care Medicine',
    'Dental Surgery','Dermatology and STD','Emergency Medicine','Endocrinology',
    'ENT (Ear, Nose, and Throat)','Forensic Medicine and Toxicology','Haematology',
    'Medical Oncology','Medicine','Microbiology','Nephrology and Renal Transplant Medicine',
    'Neurology','Neurosurgery','Nuclear Medicine','Obstetrics and Gynaecology',
    'Ophthalmology','Paediatric Surgery','Paediatrics','Pathology','Pharmacology',
    'Physical Medicine and Rehabilitation (PMR)','Physiology','Psychiatry',
    'Pulmonary Medicine','Radiation Oncology','Radiodiagnosis and Interventional Radiology',
    'Sports Injury Centre (SIC)','Surgery','Urology and Renal Transplant'
  ]::TEXT[]);

UPDATE patient_requests
SET department = NULL
WHERE department IS NOT NULL
  AND department <> ALL(ARRAY[
    'Anaesthesia and Intensive Care','Anatomy','Biochemistry',
    'Blood Centre and Transfusion Medicine','Burns, Plastic and Maxillofacial Surgery',
    'Cancer Surgery','Cardio Thoracic and Vascular Surgery (CTVS)','Cardiology',
    'Central Institute of Orthopaedics (CIO)','Community Medicine','Critical Care Medicine',
    'Dental Surgery','Dermatology and STD','Emergency Medicine','Endocrinology',
    'ENT (Ear, Nose, and Throat)','Forensic Medicine and Toxicology','Haematology',
    'Medical Oncology','Medicine','Microbiology','Nephrology and Renal Transplant Medicine',
    'Neurology','Neurosurgery','Nuclear Medicine','Obstetrics and Gynaecology',
    'Ophthalmology','Paediatric Surgery','Paediatrics','Pathology','Pharmacology',
    'Physical Medicine and Rehabilitation (PMR)','Physiology','Psychiatry',
    'Pulmonary Medicine','Radiation Oncology','Radiodiagnosis and Interventional Radiology',
    'Sports Injury Centre (SIC)','Surgery','Urology and Renal Transplant'
  ]::TEXT[]);

-- ── 5. agent_profiles: department CHECK constraint ───────────────────────────
-- Drop first in case a partial run left it behind, then re-add cleanly.
ALTER TABLE agent_profiles DROP CONSTRAINT IF EXISTS agent_department_check;
ALTER TABLE agent_profiles
  ADD CONSTRAINT agent_department_check
  CHECK (department IS NULL OR department = ANY(ARRAY[
    'Anaesthesia and Intensive Care','Anatomy','Biochemistry',
    'Blood Centre and Transfusion Medicine','Burns, Plastic and Maxillofacial Surgery',
    'Cancer Surgery','Cardio Thoracic and Vascular Surgery (CTVS)','Cardiology',
    'Central Institute of Orthopaedics (CIO)','Community Medicine','Critical Care Medicine',
    'Dental Surgery','Dermatology and STD','Emergency Medicine','Endocrinology',
    'ENT (Ear, Nose, and Throat)','Forensic Medicine and Toxicology','Haematology',
    'Medical Oncology','Medicine','Microbiology','Nephrology and Renal Transplant Medicine',
    'Neurology','Neurosurgery','Nuclear Medicine','Obstetrics and Gynaecology',
    'Ophthalmology','Paediatric Surgery','Paediatrics','Pathology','Pharmacology',
    'Physical Medicine and Rehabilitation (PMR)','Physiology','Psychiatry',
    'Pulmonary Medicine','Radiation Oncology','Radiodiagnosis and Interventional Radiology',
    'Sports Injury Centre (SIC)','Surgery','Urology and Renal Transplant'
  ]::TEXT[]));

-- ── 6. patient_requests: department CHECK constraint ─────────────────────────
ALTER TABLE patient_requests DROP CONSTRAINT IF EXISTS patient_request_department_check;
ALTER TABLE patient_requests
  ADD CONSTRAINT patient_request_department_check
  CHECK (department IS NULL OR department = ANY(ARRAY[
    'Anaesthesia and Intensive Care','Anatomy','Biochemistry',
    'Blood Centre and Transfusion Medicine','Burns, Plastic and Maxillofacial Surgery',
    'Cancer Surgery','Cardio Thoracic and Vascular Surgery (CTVS)','Cardiology',
    'Central Institute of Orthopaedics (CIO)','Community Medicine','Critical Care Medicine',
    'Dental Surgery','Dermatology and STD','Emergency Medicine','Endocrinology',
    'ENT (Ear, Nose, and Throat)','Forensic Medicine and Toxicology','Haematology',
    'Medical Oncology','Medicine','Microbiology','Nephrology and Renal Transplant Medicine',
    'Neurology','Neurosurgery','Nuclear Medicine','Obstetrics and Gynaecology',
    'Ophthalmology','Paediatric Surgery','Paediatrics','Pathology','Pharmacology',
    'Physical Medicine and Rehabilitation (PMR)','Physiology','Psychiatry',
    'Pulmonary Medicine','Radiation Oncology','Radiodiagnosis and Interventional Radiology',
    'Sports Injury Centre (SIC)','Surgery','Urology and Renal Transplant'
  ]::TEXT[]));

-- END: 0002_hospital_lockdown.sql


-- ############################################################
-- BEGIN: 0003_ratings_and_bookings.sql
-- ############################################################

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


-- END: 0003_ratings_and_bookings.sql


-- ############################################################
-- BEGIN: 0004_fix_rls_and_realtime.sql
-- ############################################################

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



-- END: 0004_fix_rls_and_realtime.sql


-- ############################################################
-- BEGIN: 0005_intake_tier.sql
-- ############################################################

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

-- Enforce NOT NULL after backfill — every row must have a tier
ALTER TABLE intake_records ALTER COLUMN tier SET NOT NULL;

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


-- END: 0005_intake_tier.sql


-- ############################################################
-- BEGIN: 0006_intake_tier_providers.sql
-- ############################################################

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


-- END: 0006_intake_tier_providers.sql

