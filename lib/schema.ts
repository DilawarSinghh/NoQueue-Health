import { z } from "zod";

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

// ─── AI response shape ────────────────────────────────────────────────────────
// The Groq route returns one of these two shapes:

export const emergencyResponseSchema = z.object({
  emergency: z.literal(true),
  message:   z.string(),
});

export const normalResponseSchema = z.object({
  emergency:     z.literal(false),
  updatedData:   intakeDataSchema.partial(),
  nextQuestion:  z.string().nullable(),
  isComplete:    z.boolean(),
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
