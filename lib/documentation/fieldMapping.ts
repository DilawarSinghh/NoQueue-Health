/**
 * lib/documentation/fieldMapping.ts
 *
 * Safe prefill: resolve template `mapsTo` keys against the patient profile
 * and the LATEST structured intake case. Never invents values — missing
 * data returns undefined and the field stays blank ("Not provided").
 *
 * Canonical mapsTo keys:
 *   profile.* — name, phone, email, dob, age, gender, address,
 *                allergies, chronicConditions
 *   case.*    — chiefComplaint, symptomOnset, symptomDuration,
 *                symptomSeverity, associatedSymptoms, priorEpisodes,
 *                medicationsTried, doctorOrDepartment, department
 */

import type { PatientContext } from "@/lib/schema";
import type { DocumentFormData, DocumentPrefill } from "./types";
import { DOCUMENT_TEMPLATES } from "./templates";

export interface PatientProfileSource {
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  dob?: string | null;
  age?: number | string | null;
  gender?: string | null;
  address?: string | null;
  allergies?: string | null;
  chronicConditions?: string | null;
}

export interface IntakeCaseSource {
  patientContext?: PatientContext | null;
  chiefComplaint?: string | null;
  symptomOnset?: string | null;
  symptomDuration?: string | null;
  symptomSeverity?: string | null;
  associatedSymptoms?: string | null;
  priorEpisodes?: string | null;
  medicationsTried?: string | null;
  doctorOrDepartment?: string | null;
  department?: string | null;
}

export interface PrefillSources {
  profile?: PatientProfileSource | null;
  intakeCase?: IntakeCaseSource | null;
}

/** Normalise any raw value to a safe display string (never invents data). */
function toDisplayString(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

function resolveKey(key: string, sources: PrefillSources): string | undefined {
  const { profile, intakeCase } = sources;
  const [scope, ...rest] = key.split(".");
  const field = rest.join(".");

  if (scope === "profile" && profile) {
    return toDisplayString((profile as Record<string, unknown>)[field]);
  }
  if (scope === "case" && intakeCase) {
    // Department may live at case.department or case.doctorOrDepartment.
    if (field === "department") {
      return (
        toDisplayString(intakeCase.department) ??
        toDisplayString(intakeCase.doctorOrDepartment) ??
        toDisplayString(intakeCase.patientContext ? undefined : undefined)
      );
    }
    return toDisplayString((intakeCase as Record<string, unknown>)[field]);
  }
  return undefined;
}

export function getTemplatePrefill(
  templateId: string,
  sources: PrefillSources
): DocumentPrefill {
  const values: DocumentFormData = {};
  const prefilled: Record<string, boolean> = {};
  const template = DOCUMENT_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return { values, prefilled };

  for (const section of template.sections) {
    for (const field of section.fields) {
      if (!field.mapsTo) continue;
      const v = resolveKey(field.mapsTo, sources);
      if (v !== undefined) {
        values[field.id] = v;
        prefilled[field.id] = true;
      }
    }
  }
  return { values, prefilled };
}
