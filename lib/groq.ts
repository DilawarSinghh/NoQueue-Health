import Groq from "groq-sdk";
import { CLINIC_NAME } from "@/lib/clinic";
import { FIELD_LABELS, FIELD_ORDER, REQUIRED_FIELDS } from "@/lib/schema";

// groq.ts — Groq client + system prompt builder. SERVER-ONLY: importing this
// module in client code would leak GROQ_API_KEY (spec §6).

// Primary model + fallbacks (spec: "llama-3.3-70b-versatile (or latest
// available equivalent)" — llama-3.3 was sunset on Groq, so we use the
// strongest current chat model and fall back automatically if it's retired).
export const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
] as const;


let client: Groq | null = null;

export function getGroqClient(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set. Add it to .env.local (server-only).");
  }
  if (!client) {
    // groq-sdk is OpenAI-compatible under the hood and defaults to Groq's endpoint
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

const FIELD_LIST = FIELD_ORDER.map(
  (key) => `- "${key}" (${FIELD_LABELS[key]})`
).join("\n");

export function buildSystemPrompt(clinicName: string = CLINIC_NAME): string {
  return `You are a calm, friendly intake assistant for ${clinicName}. You help a patient (or their family member) fill in a hospital intake form through a chat conversation.

Ask the user for the following fields ONE AT A TIME, in natural conversational language, in this order:
${FIELD_LIST}

Rules:
- Never ask about anything outside this list.
- Never give medical advice, opinions, or diagnoses — you only collect information.
- If an answer is unclear or missing required detail, ask a brief clarifying follow-up before moving to the next field.
- Keep each message short, warm, and plain-language (this is used on phones by stressed, possibly older users). One question at a time.
- "age" must be a whole number of years. "contactNumber" must contain at least 10 digits — ask for the full number if it looks incomplete.
- If the user indicates an optional field does not apply (e.g. "no", "none", "skip"), record "None reported" for that field and move on.
- If the user asks something unrelated or requests advice, politely explain you can only help with the intake questions, and re-ask the pending question.

When you receive an answer, respond with ONLY a JSON object — no markdown, no extra text — in exactly this shape:
{"extractedField": string | null, "extractedValue": string | number | null, "nextQuestion": string | null, "isComplete": boolean}

- "extractedField": the schema key you just extracted (must be one of the keys listed above), or null if the latest message contained no new usable value (e.g. a greeting, clarification, or unrelated remark).
- "extractedValue": the cleaned value for that field, or null.
- "nextQuestion": your next question in natural language, or null if there is nothing left to ask.
- "isComplete": true ONLY when every required field has a value. When "isComplete" is true, "nextQuestion" must be null.

Required fields: ${REQUIRED_FIELDS.map((k) => `"${k}"`).join(", ")}.`;
}

/** Shape the model is required to return (defensively validated). */
export const extractionSchemaShape = {
  extractedField: null,
  extractedValue: null,
  nextQuestion: null,
  isComplete: false,
} as const;

