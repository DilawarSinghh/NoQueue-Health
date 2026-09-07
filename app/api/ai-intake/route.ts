import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { z } from "zod";
import {
  emergencyResponseSchema,
  normalResponseSchema,
  normalizeDepartment,
  type AIResponse,
  type IntakeDataPartial,
  type PatientContext,
  INTAKE_FIELD_ORDER,
  INTAKE_FIELD_LABELS,
  REQUIRED_INTAKE_FIELDS,
} from "@/lib/schema";
import { DEPARTMENTS } from "@/lib/constants/hospital";

// ─── Groq client (server-only) ────────────────────────────────────────────────
function getGroq() {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// Models tried in order — first success wins
const MODELS = [
  "llama-3.3-70b-versatile",
  "llama3-70b-8192",
  "mixtral-8x7b-32768",
];

// ─── System prompt ────────────────────────────────────────────────────────────
function buildSystemPrompt(ctx: PatientContext): string {
  const known = [
    ctx.name                && `Name: ${ctx.name}`,
    ctx.age                 && `Age: ${ctx.age}`,
    ctx.gender              && `Gender: ${ctx.gender}`,
    ctx.allergies           && `Known allergies: ${ctx.allergies}`,
    ctx.chronicConditions   && `Chronic conditions: ${ctx.chronicConditions}`,
  ]
    .filter(Boolean)
    .join("\n");

  const fieldList = INTAKE_FIELD_ORDER.map(
    (k) => `- "${k}": ${INTAKE_FIELD_LABELS[k]}`
  ).join("\n");

  const required = REQUIRED_INTAKE_FIELDS.join(", ");

  const deptList = DEPARTMENTS.join(", ");

  return `You are a clinical intake assistant for a hospital documentation platform.

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
   - "nextQuestion": your next question in natural language, or null when done.
   - "isComplete": true ONLY when these required fields all have values: ${required}. When true, nextQuestion must be null.

7. If the patient's message contains no useful intake information (greeting, off-topic, confusion), set updatedData to the existing data unchanged, ask the pending question again in nextQuestion, and set isComplete to false.

DEPARTMENT RECOMMENDATION (add ONLY when isComplete is true):
Once you set isComplete to true, determine which ONE department from this fixed list is the most appropriate starting point for this patient's visit:
${deptList}

Rules for this recommendation:
- This is a ROUTING suggestion — which specialist is best positioned to evaluate this complaint — NOT a diagnosis of what condition the patient has.
- If symptoms are broad/unclear or could fit general internal medicine, default to "Medicine" rather than guessing a narrow specialty — it is always safer to under-specify than to confidently route to the wrong specialist.
- If the patient is a child (age under 18), prefer "Paediatrics" as the entry point unless the complaint is clearly surgical/emergency in nature.
- If the EMERGENCY RULE was triggered, do NOT include a department recommendation at all — emergency takes priority.
- Always include a brief (1-2 sentence) plain-language reason for the recommendation, written for the patient to understand (e.g., "Based on your chest discomfort and shortness of breath, Cardiology is a good starting point for evaluation.") — NEVER state or imply a specific diagnosis in this reasoning.
- If genuinely uncertain between two departments, include both: name the primary in recommendedDepartment and the secondary in alternateDepartment.
- The department name MUST exactly match one of the values in the list above — do not paraphrase or abbreviate.

When isComplete is true, extend your JSON with these fields:
{"emergency":false,"updatedData":{...},"nextQuestion":null,"isComplete":true,"recommendedDepartment":"<exact dept name>","recommendedDepartmentReason":"<1-2 sentences for patient>","alternateDepartment":"<exact dept name or omit>"}`;
}

// ─── Request body schema ──────────────────────────────────────────────────────
const requestSchema = z.object({
  conversationHistory:  z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
  patientContext:       z.object({
    name:              z.string(),
    age:               z.number().nullable(),
    gender:            z.string().nullable(),
    allergies:         z.string().nullable(),
    chronicConditions: z.string().nullable(),
  }),
  currentStructuredData: z.record(z.string()).default({}),
});

// ─── Parse AI output defensively ─────────────────────────────────────────────
function parseAIOutput(raw: string): AIResponse | null {
  // Strip any accidental markdown fences
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

  // Emergency path
  const emr = emergencyResponseSchema.safeParse(parsed);
  if (emr.success) return emr.data;

  // Normal path
  const norm = normalResponseSchema.safeParse(parsed);
  if (norm.success) {
    const result = norm.data;
    // Normalise department fields if the intake is complete.
    // The AI might return abbreviations or slight rewording — normalizeDepartment()
    // fuzzy-matches against the fixed DEPARTMENTS list and falls back to "Medicine".
    if (result.isComplete && result.recommendedDepartment) {
      result.recommendedDepartment = normalizeDepartment(result.recommendedDepartment);
      if (result.alternateDepartment) {
        result.alternateDepartment = normalizeDepartment(result.alternateDepartment);
      }
    }
    return result;
  }

  return null;
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { conversationHistory, patientContext, currentStructuredData } = parsed.data;
  const systemPrompt = buildSystemPrompt(patientContext as PatientContext);

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map((m) => ({
      role:    m.role as "user" | "assistant",
      content: m.content,
    })),
    // Remind the model of what's already been collected so it can merge properly
    {
      role:    "system" as const,
      content: `Current collected data so far (merge this into updatedData): ${JSON.stringify(currentStructuredData)}`,
    },
  ];

  const groq = getGroq();
  let lastError: string = "All models failed";

  for (const model of MODELS) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages,
        temperature:       0.3,
        max_tokens:        512,
        response_format:   { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content ?? "";

      // Emergency check — fast path before parsing
      if (raw.includes('"emergency":true')) {
        const result = parseAIOutput(raw);
        if (result?.emergency) return NextResponse.json(result);
      }

      const result = parseAIOutput(raw);
      if (result) return NextResponse.json(result);

      // Malformed — re-prompt once
      const retry = await groq.chat.completions.create({
        model,
        messages: [
          ...messages,
          { role: "assistant", content: raw },
          {
            role:    "user",
            content:
              'Your last response was not valid JSON. Reply ONLY with the JSON object described in the system prompt. No markdown, no extra text.',
          },
        ],
        temperature:     0.1,
        max_tokens:      512,
        response_format: { type: "json_object" },
      });

      const retryRaw = retry.choices[0]?.message?.content ?? "";
      const retryResult = parseAIOutput(retryRaw);
      if (retryResult) return NextResponse.json(retryResult);

      lastError = "Malformed AI response after retry";
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : "Unknown error";
      // Try next model
      continue;
    }
  }

  return NextResponse.json({ error: lastError }, { status: 502 });
}
