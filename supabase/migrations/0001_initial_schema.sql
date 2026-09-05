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
