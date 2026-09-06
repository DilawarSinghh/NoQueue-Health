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