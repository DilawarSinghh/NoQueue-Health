// schema.ts — patient intake schema (Step 3 wires it into the AI + validation)
//
// TODO(Step 3):
// Define with Zod (exact shape from spec §3):
//
//   export const patientIntakeSchema = z.object({
//     patientName: z.string().min(1),
//     age: z.number().int().positive(),
//     gender: z.string().min(1),
//     contactNumber: z.string().min(10),
//     address: z.string().optional(),
//     doctorOrDepartment: z.string().min(1),
//     chiefComplaint: z.string().min(1),
//     knownAllergies: z.string().default("None reported"),
//     currentMedications: z.string().optional(),
//     pastMedicalHistory: z.string().optional(),
//     insuranceProvider: z.string().optional(),
//     insuranceId: z.string().optional(),
//     emergencyContactName: z.string().optional(),
//     emergencyContactNumber: z.string().optional(),
//   });
//
// Also export: PatientIntakeInput (z.input) / PatientIntake (z.output) types,
// the ordered list of schema keys (for the AI's question order), and a
// REQUIRED_FIELDS list. This single schema is used to (a) instruct the AI,
// (b) validate AI-extracted JSON server-side, (c) validate the review
// screen's edited output before PDF generation.
export {}; // scaffold — implemented in Step 3
