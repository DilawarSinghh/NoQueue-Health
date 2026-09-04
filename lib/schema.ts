import { z } from "zod";

// Patient intake schema — spec §3. Single source of truth used to:
// (a) instruct the AI what to collect, (b) validate AI-extracted JSON
// server-side before it's shown to the user, (c) validate the review
// screen's edited output before PDF generation.
export const patientIntakeSchema = z.object({
  patientName: z.string().min(1),
  age: z.number().int().positive(),
  gender: z.string().min(1),
  contactNumber: z.string().min(10),
  address: z.string().optional(),
  doctorOrDepartment: z.string().min(1),
  chiefComplaint: z.string().min(1),
  knownAllergies: z.string().default("None reported"),
  currentMedications: z.string().optional(),
  pastMedicalHistory: z.string().optional(),
  insuranceProvider: z.string().optional(),
  insuranceId: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactNumber: z.string().optional(),
});

export type PatientIntake = z.output<typeof patientIntakeSchema>;
export type PatientIntakeInput = z.input<typeof patientIntakeSchema>;
/** Partially-collected data as it flows through intake (client + API). */
export type PatientIntakePartial = Partial<PatientIntakeInput>;

/** Canonical question order the AI must follow. */
export const FIELD_ORDER = [
  "patientName",
  "age",
  "gender",
  "contactNumber",
  "address",
  "doctorOrDepartment",
  "chiefComplaint",
  "knownAllergies",
  "currentMedications",
  "pastMedicalHistory",
  "insuranceProvider",
  "insuranceId",
  "emergencyContactName",
  "emergencyContactNumber",
] as const;

export type IntakeField = (typeof FIELD_ORDER)[number];

/** Fields that must be present before the intake is complete. */
export const REQUIRED_FIELDS: readonly IntakeField[] = [
  "patientName",
  "age",
  "gender",
  "contactNumber",
  "doctorOrDepartment",
  "chiefComplaint",
];

/** Human-readable labels (used by progress UI and the review screen). */
export const FIELD_LABELS: Record<IntakeField, string> = {
  patientName: "Patient name",
  age: "Age",
  gender: "Gender",
  contactNumber: "Contact number",
  address: "Address",
  doctorOrDepartment: "Doctor / department",
  chiefComplaint: "Chief complaint (reason for visit)",
  knownAllergies: "Known allergies",
  currentMedications: "Current medications",
  pastMedicalHistory: "Past medical history",
  insuranceProvider: "Insurance provider",
  insuranceId: "Insurance ID",
  emergencyContactName: "Emergency contact name",
  emergencyContactNumber: "Emergency contact number",
};

export const TOTAL_FIELDS = FIELD_ORDER.length;

function hasValue(value: unknown): boolean {
  return value !== undefined && String(value).trim() !== "";
}

/** Progress indicator count — non-empty schema keys. */
export function countCollectedFields(data: PatientIntakePartial): number {
  return FIELD_ORDER.filter((key) => hasValue(data[key])).length;
}

/** True only when every required field has a non-empty value. */
export function isDataComplete(data: PatientIntakePartial): boolean {
  return REQUIRED_FIELDS.every((key) => hasValue(data[key]));
}

