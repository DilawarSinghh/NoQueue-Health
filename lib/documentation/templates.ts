/**
 * lib/documentation/templates.ts
 *
 * Starter hospital document templates. These are DIGITAL equivalents only —
 * the exact official forms (when supplied by the hospital) should replace the
 * fields below. Add new templates by appending to this array.
 *
 * Field `mapsTo` values are canonical prefill keys resolved by
 * fieldMapping.ts (patient profile + latest intake case). Prefill never
 * invents data — missing values stay blank / "Not provided".
 */

import { DEPARTMENTS } from "@/lib/constants/hospital";
import type { DocumentTemplate } from "./types";

const departmentOptions = DEPARTMENTS.map((d) => ({ label: d, value: d }));

const genderOptions = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
  { label: "Other", value: "other" },
];

/** Fields reused across most forms (prefill from patient profile). */
const patientDetailFields = [
  { id: "patient_name", label: "Patient Name", type: "text" as const, mapsTo: "profile.fullName", colSpan: "half" as const },
  { id: "dob", label: "Date of Birth", type: "date" as const, mapsTo: "profile.dob", colSpan: "half" as const },
  { id: "age", label: "Age", type: "number" as const, mapsTo: "profile.age", colSpan: "half" as const },
  { id: "gender", label: "Gender", type: "select" as const, options: genderOptions, mapsTo: "profile.gender", colSpan: "half" as const },
  { id: "phone", label: "Phone Number", type: "phone" as const, mapsTo: "profile.phone", colSpan: "half" as const },
  { id: "email", label: "Email", type: "email" as const, mapsTo: "profile.email", colSpan: "half" as const },
  { id: "address", label: "Address", type: "address" as const, mapsTo: "profile.address" },
];

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "admission",
    name: "Admission Form",
    description: "Patient admission details",
    category: "Admission",
    version: "1.0",
    layout: "standard",
    active: true,
    sections: [
      { id: "patient", title: "PATIENT DETAILS", fields: patientDetailFields.map((f) => ({ ...f })) },
      {
        id: "emergency",
        title: "EMERGENCY CONTACT",
        fields: [
          { id: "ec_name", label: "Contact Name", type: "text", colSpan: "half" },
          { id: "ec_relationship", label: "Relationship", type: "text", colSpan: "half" },
          { id: "ec_phone", label: "Contact Phone", type: "phone" },
        ],
      },
      {
        id: "medical",
        title: "MEDICAL INFORMATION",
        fields: [
          { id: "chief_complaint", label: "Chief Complaint", type: "textarea", mapsTo: "case.chiefComplaint", required: true },
          { id: "medical_history", label: "Relevant Medical History", type: "textarea", mapsTo: "profile.chronicConditions" },
          { id: "allergies", label: "Allergies", type: "textarea", mapsTo: "profile.allergies" },
          { id: "current_medication", label: "Current Medication", type: "textarea", mapsTo: "case.medicationsTried" },
        ],
      },
      {
        id: "admission",
        title: "ADMISSION DETAILS",
        fields: [
          { id: "department", label: "Department", type: "select", options: departmentOptions, mapsTo: "case.department", required: true },
          { id: "consulting_doctor", label: "Consulting Doctor", type: "text", placeholder: "Not provided" },
          { id: "admission_date", label: "Admission Date", type: "date" },
          { id: "reason_admission", label: "Reason for Admission", type: "textarea", mapsTo: "case.chiefComplaint" },
        ],
      },
    ],
  },
  {
    id: "discharge",
    name: "Discharge Form",
    description: "Discharge and patient details",
    category: "Discharge",
    version: "1.0",
    layout: "standard",
    active: true,
    sections: [
      { id: "patient", title: "PATIENT DETAILS", fields: patientDetailFields.map((f) => ({ ...f })) },
      { id: "visit", title: "VISIT INFORMATION", fields: [
        { id: "department", label: "Department", type: "select", options: departmentOptions, mapsTo: "case.department" },
        { id: "admission_date", label: "Admission Date", type: "date" },
        { id: "discharge_date", label: "Discharge Date", type: "date" },
        { id: "reason", label: "Reason for Admission", type: "textarea", mapsTo: "case.chiefComplaint" },
      ]},
      { id: "summary", title: "DISCHARGE SUMMARY", fields: [
        { id: "summary", label: "Clinical Summary", type: "textarea", placeholder: "Not provided" },
      ]},
    ],
  },
  {
    id: "registration",
    name: "Patient Registration Form",
    description: "New patient registration information",
    category: "Registration",
    version: "1.0",
    layout: "standard",
    active: true,
    sections: [
      { id: "patient", title: "PATIENT DETAILS", fields: patientDetailFields.map((f) => ({ ...f })) },
      { id: "visit", title: "VISIT INFORMATION", fields: [
        { id: "department", label: "Department", type: "select", options: departmentOptions, mapsTo: "case.department" },
        { id: "visit_date", label: "Visit Date", type: "date" },
        { id: "visit_type", label: "Visit Type", type: "select", options: [
          { label: "New", value: "new" },
          { label: "Follow-up", value: "follow-up" },
          { label: "Emergency", value: "emergency" },
        ]},
      ]},
    ],
  },
  {
    id: "consent",
    name: "Consent Form",
    description: "Patient consent for treatment and procedures",
    category: "Consent",
    version: "1.0",
    layout: "standard",
    active: true,
    sections: [
      { id: "patient", title: "PATIENT DETAILS", fields: patientDetailFields.slice(0, 5).map((f) => ({ ...f })) },
      { id: "consent", title: "CONSENT", fields: [
        { id: "procedure", label: "Procedure / Treatment", type: "textarea", required: true, placeholder: "Describe the procedure" },
        { id: "consent_given", label: "I voluntarily give consent for the above treatment", type: "checkbox", required: true },
        { id: "patient_signature", label: "Patient Signature", type: "signature", required: true },
        { id: "consent_date", label: "Date", type: "date", required: true },
      ]},
    ],
  },
];