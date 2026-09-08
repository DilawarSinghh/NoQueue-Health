/**
 * lib/documentation/types.ts
 *
 * Types for the Documentation module — hospital document templates and
 * generated documents.
 *
 * Templates are defined in code (see templates.ts) as the versioned source
 * of truth. Generated documents are persisted to Supabase.
 */

/** Supported form field input types. */
export type DocumentFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "time"
  | "email"
  | "phone"
  | "select"
  | "radio"
  | "checkbox"
  | "multiselect"
  | "signature"
  | "address";

/** Options for select/radio/multiselect fields. */
export interface FieldOption {
  label: string;
  value: string;
}

/** A single field within a document template section. */
export interface DocumentField {
  id: string;
  label: string;
  type: DocumentFieldType;
  required?: boolean;
  placeholder?: string;
  /** Options for select/radio/multiselect fields. */
  options?: FieldOption[];
  /** Mapping target used for prefill (patient profile / intake case). */
  mapsTo?: string;
  /** Free-text hint shown to the patient. e.g. "Consent must be confirmed." */
  help?: string;
  /** Grid span hint for layout (e.g. "half" for side-by-side). */
  colSpan?: "full" | "half";
}

/** A visual grouping of fields within a template. */
export interface DocumentSection {
  id: string;
  title: string;
  fields: DocumentField[];
}

/** A hospital document template. */
export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  layout: "standard";
  sections: DocumentSection[];
  /** Active templates appear in the library. */
  active: boolean;
  /** Safer default per template — generation allowed without all optional fields. */
  strict?: boolean;
}

/** Map of template field id → string value (form submission). */
export type DocumentFormData = Record<string, string | string[] | boolean>;

/** Result of the prefill mapping against a patient's persisted data. */
export interface DocumentPrefill {
  /** id → value pulled from patient profile / intake case (never invented). */
  values: DocumentFormData;
  /** id → true if that value came from an existing source (to badge fields). */
  prefilled: Record<string, boolean>;
}