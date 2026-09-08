/**
 * lib/intakePrompt.ts
 *
 * Shared intake logic used by BOTH tiers:
 *   - app/api/ai-intake/low/route.ts  (Groq)
 *   - app/api/ai-intake/high/route.ts (Kimi K3)
 *
 * Exports:
 *   buildSystemPrompt()   — constructs the full system prompt string
 *   intakeRequestSchema   — Zod schema for the shared request body
 *   parseAIOutput()       — defensively parses + normalises AI JSON output
 *   INTAKE_SYSTEM_CONTEXT — static reminder injected as a second system msg
 */

import { z } from "zod";
import {
  emergencyResponseSchema,
  normalResponseSchema,
  normalizeDepartment,
  filterMedicationItems,
  type AIResponse,
  type PatientContext,
  INTAKE_FIELD_ORDER,
  INTAKE_FIELD_LABELS,
  REQUIRED_INTAKE_FIELDS,
} from "@/lib/schema";
import { DEPARTMENTS } from "@/lib/constants/hospital";

// ─── System prompt ────────────────────────────────────────────────────────────

/**
 * @param ctx           Patient background — injected so the model never
 *                      re-asks known fields.
 * @param language      'en' | 'hi' — instructs the model which language to
 *                      use. 'hi' is only meaningful for the High tier (Kimi K3).
 *                      Low tier always receives 'en'.
 */
export function buildSystemPrompt(
  ctx: PatientContext,
  language: "en" | "hi" = "en"
): string {
  const known = [
    ctx.name              && `Name: ${ctx.name}`,
    ctx.age               && `Age: ${ctx.age}`,
    ctx.gender            && `Gender: ${ctx.gender}`,
    ctx.allergies         && `Known allergies: ${ctx.allergies}`,
    ctx.chronicConditions && `Chronic conditions: ${ctx.chronicConditions}`,
  ]
    .filter(Boolean)
    .join("\n");

  const fieldList = INTAKE_FIELD_ORDER.map(
    (k) => `- "${k}": ${INTAKE_FIELD_LABELS[k]}`
  ).join("\n");

  const required = REQUIRED_INTAKE_FIELDS.join(", ");
  const deptList = DEPARTMENTS.join(", ");

  const langInstruction =
    language === "hi"
      ? `LANGUAGE: The patient may write or speak in Hindi or English. Detect which language they are using from their message and respond in the SAME language. If they switch mid-conversation, switch with them. Structured field values (department names, etc.) must always be in English canonical form in the JSON — only the conversational nextQuestion may be in Hindi.`
      : `LANGUAGE: Respond in English only.`;

  return `You are a clinical intake assistant for a hospital documentation platform.

${langInstruction}

The patient's known background (DO NOT ask about any of this again):
${known || "None provided"}

Your job is to collect the following structured fields through natural conversation:
${fieldList}

Rules:
1. Ask ONE question at a time in a warm, plain-language, conversational tone.
2. NEVER re-ask anything already provided in the patient background above.
3. After chiefComplaint is collected, generate adaptive follow-up questions based on what the patient describes — go deeper the way an experienced nurse would (location/character/radiation/triggers for pain; onset pattern/associated symptoms for fever; etc.).
4. NEVER state, imply, or suggest a diagnosis. NEVER recommend any medication or treatment. Information-gathering ONLY.
5. EMERGENCY RULE — HIGHEST PRIORITY: If the patient describes ANYTHING potentially urgent (chest pain, difficulty breathing, severe/uncontrolled bleeding, stroke signs, loss of consciousness, severe allergic reaction, suicidal thoughts, poisoning) you MUST respond ONLY with this exact JSON and nothing else:
   {"emergency":true,"message":"Please seek emergency care immediately — call your local emergency number or go to the nearest ER now. Do not wait to complete this form."}

6. Otherwise respond ONLY with valid JSON in this exact shape (no markdown, no extra text):
   {"emergency":false,"updatedData":{...merged fields},"nextQuestion":"string or null","isComplete":boolean}

   - "updatedData": merge ALL previously collected fields with any new ones from this turn.
   - "nextQuestion": your next question in natural language (in the patient's language), or null when done.
   - "isComplete": true ONLY when these required fields all have values: ${required}. When true, nextQuestion must be null.

7. If the patient's message contains no useful intake information (greeting, off-topic, confusion), set updatedData to the existing data unchanged, ask the pending question again in nextQuestion, and set isComplete to false.

DEPARTMENT RECOMMENDATION (add ONLY when isComplete is true):
Once you set isComplete to true, determine which ONE department from this fixed list is the most appropriate starting point for this patient's visit:
${deptList}

Rules for this recommendation:
- This is a ROUTING suggestion — which specialist is best positioned to evaluate this complaint — NOT a diagnosis.
- If symptoms are broad/unclear, default to "Medicine" rather than guessing a narrow specialty.
- If the patient is a child (age under 18), prefer "Paediatrics" unless the complaint is clearly surgical/emergency.
- If the EMERGENCY RULE was triggered, do NOT include a department recommendation.
- Always include a brief (1-2 sentence) plain-language reason for the recommendation written for the patient — NEVER imply a diagnosis. Write this in English regardless of conversation language (it appears on the review screen alongside English UI).
- If genuinely uncertain between two departments, include both in recommendedDepartment and alternateDepartment.
- Department name MUST exactly match one of the values in the list above.

SUGGESTED INVESTIGATIONS (add ONLY when isComplete is true, NEVER when emergency is true):
Suggest COMMONLY RELEVANT DIAGNOSTIC TESTS a doctor might consider ordering. Informational context for the doctor only — NOT an instruction or prescription.

Rules for suggested investigations:
- List 2-5 test names only (e.g. "CBC", "Chest X-ray", "ECG"). No framing text, no "you need".
- NEVER include any medication, drug name, dosage, or treatment. Only diagnostic tests.
- If symptoms are too vague, return an empty array — that is correct and safe.
- If the EMERGENCY RULE triggered, set suggestedInvestigations to [].
- Always include this exact disclaimer: "These are commonly associated tests, not a prescription — your doctor will decide what's actually needed based on examination."

When isComplete is true, your full JSON response must be:
{"emergency":false,"updatedData":{...},"nextQuestion":null,"isComplete":true,"recommendedDepartment":"<exact dept name>","recommendedDepartmentReason":"<1-2 sentences in English>","alternateDepartment":"<exact dept name or omit>","suggestedInvestigations":["Test 1","Test 2"],"investigationsDisclaimer":"These are commonly associated tests, not a prescription — your doctor will decide what's actually needed based on examination."}`;
}

// ─── Request schema ───────────────────────────────────────────────────────────

export const intakeRequestSchema = z.object({
  conversationHistory: z.array(
    z.object({ role: z.enum(["user", "assistant"]), content: z.string() })
  ),
  patientContext: z.object({
    name:              z.string(),
    age:               z.number().nullable(),
    gender:            z.string().nullable(),
    allergies:         z.string().nullable(),
    chronicConditions: z.string().nullable(),
  }),
  currentStructuredData: z.record(z.string()).default({}),
  /** High tier only — 'hi' enables Hindi language instruction in prompt. */
  language: z.enum(["en", "hi"]).default("en"),
});

export type IntakeRequest = z.output<typeof intakeRequestSchema>;

// ─── Response parser ──────────────────────────────────────────────────────────

/**
 * Defensively parses a raw string from any model into a typed AIResponse.
 * Applies the medication blocklist to suggestedInvestigations server-side.
 * Returns null if the string cannot be parsed into a known response shape.
 */
export function parseAIOutput(raw: string): AIResponse | null {
  // Strip accidental markdown fences
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  // Emergency path — fast exit
  const emr = emergencyResponseSchema.safeParse(parsed);
  if (emr.success) return emr.data;

  // Normal path
  const norm = normalResponseSchema.safeParse(parsed);
  if (!norm.success) return null;

  const result = norm.data;

  if (result.isComplete) {
    // Normalise department — fuzzy-match against fixed list, fallback "Medicine"
    if (result.recommendedDepartment) {
      result.recommendedDepartment = normalizeDepartment(result.recommendedDepartment);
    }
    if (result.alternateDepartment) {
      result.alternateDepartment = normalizeDepartment(result.alternateDepartment);
    }

    // Safety-net: strip any medication-like items the model may have included
    if (result.suggestedInvestigations?.length) {
      result.suggestedInvestigations = filterMedicationItems(result.suggestedInvestigations);
    }

    // Ensure disclaimer is always present when investigations are non-empty
    if (result.suggestedInvestigations?.length && !result.investigationsDisclaimer) {
      result.investigationsDisclaimer =
        "These are commonly associated tests, not a prescription — your doctor will decide what's actually needed based on examination.";
    }
  }

  return result;
}

// ─── Shared system context reminder ──────────────────────────────────────────
// Injected as a second system message to remind the model of current data.

export function buildDataReminder(currentStructuredData: Record<string, string>): string {
  return `Current collected data so far (merge this into updatedData): ${JSON.stringify(currentStructuredData)}`;
}
