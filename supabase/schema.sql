-- Scriba — intake_records table (spec §4, /api/submit)
-- Run once in the Supabase dashboard → SQL Editor.
-- Columns match the patient intake schema fields (camelCase), plus pdf_url
-- and created_at per spec.

create table if not exists intake_records (
  id uuid primary key default gen_random_uuid(),
  "patientName" text not null,
  "age" integer not null,
  "gender" text not null,
  "contactNumber" text not null,
  "address" text,
  "doctorOrDepartment" text not null,
  "chiefComplaint" text not null,
  "knownAllergies" text not null default 'None reported',
  "currentMedications" text,
  "pastMedicalHistory" text,
  "insuranceProvider" text,
  "insuranceId" text,
  "emergencyContactName" text,
  "emergencyContactNumber" text,
  "pdf_url" text not null,
  "created_at" timestamptz not null default now()
);

-- The service role key bypasses RLS, so no policy is required for the API
-- route, but RLS stays enabled to keep the table locked down otherwise.
alter table intake_records enable row level security;
