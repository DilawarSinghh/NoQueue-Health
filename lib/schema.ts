import { z } from "zod";
import { DEPARTMENTS, type Department } from "@/lib/constants/hospital";

// ─── Spec §7 adaptive intake schema ──────────────────────────────────────────
// Single source of truth used by:
//   (a) the AI system prompt — tells the model what to collect
//   (b) server-side Zod validation of every AI response
//   (c) the review screen — editable fields before PDF generation
//   (d) the PDF template

export const intakeDataSchema = z.object({
  chiefComplaint:      z.string().min(1),
  symptomOnset:        z.string().min(1),
  symptomDuration:     z.string().min(1),
  symptomSeverity:     z.string().min(1), // patient's own words, never clinical
  associatedSymptoms:  z.string().default("None reported"),
  priorEpisodes:       z.string().default("None reported"),
  medicationsTried:    z.string().default("None reported"),
  doctorOrDepartment:  z.string().min(1),
});

export type IntakeData        = z.output<typeof intakeDataSchema>;
export type IntakeDataPartial = Partial<z.input<typeof intakeDataSchema>>;

/** Fields collected in this order — drives AI question sequencing. */
export const INTAKE_FIELD_ORDER = [
  "chiefComplaint",
  "symptomOnset",
  "symptomDuration",
  "symptomSeverity",
  "associatedSymptoms",
  "priorEpisodes",
  "medicationsTried",
  "doctorOrDepartment",
] as const;

export type IntakeField = (typeof INTAKE_FIELD_ORDER)[number];

/** Required before the report can be generated. */
export const REQUIRED_INTAKE_FIELDS: readonly IntakeField[] = [
  "chiefComplaint",
  "symptomOnset",
  "symptomDuration",
  "symptomSeverity",
  "doctorOrDepartment",
];

/** Human-readable labels used on the review screen and PDF. */
export const INTAKE_FIELD_LABELS: Record<IntakeField, string> = {
  chiefComplaint:     "Chief complaint",
  symptomOnset:       "When symptoms started",
  symptomDuration:    "How long symptoms have lasted",
  symptomSeverity:    "Severity (patient's own words)",
  associatedSymptoms: "Associated symptoms",
  priorEpisodes:      "Prior episodes",
  medicationsTried:   "Medications tried",
  doctorOrDepartment: "Doctor / department",
};

// ─── Department recommendation (returned by AI on completion) ─────────────────
// The AI returns these fields in the same JSON response when isComplete = true.
// Validated server-side and normalised via normalizeDepartment() below.

export const departmentRecommendationSchema = z.object({
  recommendedDepartment:       z.enum(DEPARTMENTS),
  recommendedDepartmentReason: z.string().min(1).max(400),
  alternateDepartment:         z.enum(DEPARTMENTS).optional(),
});

export type DepartmentRecommendation = z.output<typeof departmentRecommendationSchema>;

/**
 * Fuzzy-matches an AI-returned department string against the fixed DEPARTMENTS
 * list. Handles:
 *   - Exact match (fast path)
 *   - Case-insensitive match
 *   - Common abbreviations: ENT, CIO, CTVS, SIC, PMR
 *   - Partial/substring match (e.g. "Cardio Thoracic" → full name)
 *   - Falls back to "Medicine" (general internal medicine) if nothing matches
 *
 * Returns the canonical Department value, never an invalid string.
 */
export function normalizeDepartment(raw: string | undefined | null): Department {
  if (!raw) return "Medicine";

  const trimmed = raw.trim();

  // 1. Exact match
  if ((DEPARTMENTS as readonly string[]).includes(trimmed)) {
    return trimmed as Department;
  }

  // 2. Case-insensitive exact match
  const lower = trimmed.toLowerCase();
  const exactCI = DEPARTMENTS.find((d) => d.toLowerCase() === lower);
  if (exactCI) return exactCI;

  // 3. Known abbreviation expansions
  const abbrevMap: Record<string, Department> = {
    "ent":        "ENT (Ear, Nose, and Throat)",
    "cio":        "Central Institute of Orthopaedics (CIO)",
    "ctvs":       "Cardio Thoracic and Vascular Surgery (CTVS)",
    "sic":        "Sports Injury Centre (SIC)",
    "pmr":        "Physical Medicine and Rehabilitation (PMR)",
    "ob/gyn":     "Obstetrics and Gynaecology",
    "obstetrics": "Obstetrics and Gynaecology",
    "gynae":      "Obstetrics and Gynaecology",
    "ortho":      "Central Institute of Orthopaedics (CIO)",
    "orthopaedics": "Central Institute of Orthopaedics (CIO)",
    "general medicine": "Medicine",
    "general surgery":  "Surgery",
    "general surgery (surgery)": "Surgery",
    "paediatric":  "Paediatrics",
    "pediatrics":  "Paediatrics",
    "neuroscience": "Neurology",
    "chest":       "Pulmonary Medicine",
    "respiratory": "Pulmonary Medicine",
    "kidney":      "Nephrology and Renal Transplant Medicine",
    "renal":       "Nephrology and Renal Transplant Medicine",
    "heart":       "Cardiology",
    "cardiac":     "Cardiology",
    "skin":        "Dermatology and STD",
    "dermatology": "Dermatology and STD",
    "eye":         "Ophthalmology",
    "eyes":        "Ophthalmology",
    "eye care":    "Ophthalmology",
    "cancer":      "Medical Oncology",
    "oncology":    "Medical Oncology",
    "burns":       "Burns, Plastic and Maxillofacial Surgery",
    "plastic surgery": "Burns, Plastic and Maxillofacial Surgery",
    "dental":      "Dental Surgery",
    "blood":       "Blood Centre and Transfusion Medicine",
    "psychiatry":  "Psychiatry",
    "mental health": "Psychiatry",
    "radiology":   "Radiodiagnosis and Interventional Radiology",
    "urology":     "Urology and Renal Transplant",
  };
  const abbrev = abbrevMap[lower];
  if (abbrev) return abbrev;

  // 4. Substring match — find first department that contains the input (or vice versa)
  const substringMatch = DEPARTMENTS.find(
    (d) => d.toLowerCase().includes(lower) || lower.includes(d.toLowerCase().split(" ")[0])
  );
  if (substringMatch) return substringMatch;

  // 5. Safe default — general internal medicine is the most appropriate fallback
  return "Medicine";
}

// ─── AI response shape ────────────────────────────────────────────────────────
// The Groq route returns one of these two shapes:

export const emergencyResponseSchema = z.object({
  emergency: z.literal(true),
  message:   z.string(),
});

// When isComplete = false, department fields are absent.
// When isComplete = true, the model should include them — but we validate
// and normalise server-side, so we accept them as optional strings first
// then normalise with normalizeDepartment().
export const normalResponseSchema = z.object({
  emergency:                   z.literal(false),
  updatedData:                 intakeDataSchema.partial(),
  nextQuestion:                z.string().nullable(),
  isComplete:                  z.boolean(),
  recommendedDepartment:       z.string().optional(),
  recommendedDepartmentReason: z.string().optional(),
  alternateDepartment:         z.string().optional(),
});

export type AIResponse =
  | z.output<typeof emergencyResponseSchema>
  | z.output<typeof normalResponseSchema>;

// ─── Patient context passed into every AI request ────────────────────────────
export interface PatientContext {
  name:              string;
  age:               number | null;
  gender:            string | null;
  allergies:         string | null;
  chronicConditions: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasValue(v: unknown): boolean {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

export function countCollectedFields(data: IntakeDataPartial): number {
  return INTAKE_FIELD_ORDER.filter((k) => hasValue(data[k])).length;
}

export function isIntakeComplete(data: IntakeDataPartial): boolean {
  return REQUIRED_INTAKE_FIELDS.every((k) => hasValue(data[k]));
}
