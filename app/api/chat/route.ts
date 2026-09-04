import { NextResponse } from "next/server";
import { z } from "zod";

import { CLINIC_NAME } from "@/lib/clinic";
import {
  buildSystemPrompt,
  getGroqClient,
  GROQ_MODELS,
} from "@/lib/groq";
import {
  FIELD_LABELS,
  FIELD_ORDER,
  isDataComplete,
  REQUIRED_FIELDS,
  type IntakeField,
  type PatientIntakePartial,
} from "@/lib/schema";
import type { ChatMessage } from "@/types/patient";

// POST /api/chat — server-side only (spec §4, §6). GROQ_API_KEY never leaves
// the server. All client input is validated here before use.

const requestSchema = z.object({
  conversation: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      })
    )
    .max(100),
  currentData: z.record(z.unknown()).optional().default({}),
});

// Shape the model must return — validated defensively before use (§4).
const extractionSchema = z.object({
  extractedField: z.string().nullable(),
  extractedValue: z.union([z.string(), z.number()]).nullable(),
  nextQuestion: z.string().nullable(),
  isComplete: z.boolean(),
});

type Extraction = z.infer<typeof extractionSchema>;

const isIntakeField = (key: string): key is IntakeField =>
  (FIELD_ORDER as readonly string[]).includes(key);

/** Keep only known schema keys, coerce types, drop junk (never trust client). */
function sanitizePartialData(raw: Record<string, unknown>): PatientIntakePartial {
  const out: PatientIntakePartial = {};
  for (const key of FIELD_ORDER) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (key === "age") {
      const n =
        typeof value === "number" ? value : Number.parseInt(String(value), 10);
      if (Number.isInteger(n) && n > 0 && n < 150) out.age = n;
    } else {
      const s = String(value).trim();
      if (s) (out as Record<string, string>)[key] = s.slice(0, 500);
    }
  }
  return out;
}

/** Merge one AI-extracted field into the running data, with type validation. */
function mergeExtraction(
  data: PatientIntakePartial,
  extraction: Extraction
): PatientIntakePartial {
  const field = extraction.extractedField;
  const value = extraction.extractedValue;
  if (!field || !isIntakeField(field) || value === null) return data;

  const updated = { ...data };
  if (field === "age") {
    const n =
      typeof value === "number" ? value : Number.parseInt(String(value), 10);
    if (Number.isInteger(n) && n > 0 && n < 150) updated.age = n;
    // invalid ages are rejected silently — the AI will re-ask via its own flow
  } else {
    const s = String(value).trim();
    if (s) (updated as Record<string, string>)[field] = s.slice(0, 500);
  }
  return updated;
}

type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

async function callGroqJson(messages: GroqMessage[]): Promise<string> {
  const groq = getGroqClient();
  let lastError: unknown;
  for (const model of GROQ_MODELS) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages,
        response_format: { type: "json_object" }, // JSON mode, forced
        temperature: 0.4,
        max_tokens: 300,
      });
      return completion.choices[0]?.message?.content ?? "";
    } catch (err) {
      lastError = err;
      // Retired/decommissioned model → try the next candidate
      const code =
        typeof err === "object" && err !== null && "status" in err
          ? (err as { status?: number }).status
          : undefined;
      if (code === 404 || code === 400) continue;
      throw err;
    }
  }
  throw lastError;
}

function parseExtraction(raw: string): Extraction | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return extractionSchema.parse(parsed);
  } catch {
    return null;
  }
}

/** Server-side fallback question if the model forgets to ask one. */
function fallbackQuestion(data: PatientIntakePartial): string | null {
  const missing = REQUIRED_FIELDS.find(
    (key) =>
      data[key] === undefined || String(data[key] ?? "").trim() === ""
  );
  return missing
    ? `Could you tell me your ${FIELD_LABELS[missing].toLowerCase()}?`
    : null;
}

export async function POST(request: Request) {
  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request. Please refresh the page and try again." },
      { status: 400 }
    );
  }

  const currentData = sanitizePartialData(body.currentData);

  const messages = [
    { role: "system" as const, content: buildSystemPrompt(CLINIC_NAME) },
    ...body.conversation,
  ];

  let extraction: Extraction | null;
  try {
    const raw = await callGroqJson(messages);
    extraction = parseExtraction(raw);

    // Re-prompt once on malformed output (spec §4)
    if (!extraction) {
      const retryRaw = await callGroqJson([
        ...messages,
        { role: "assistant", content: raw || "(empty response)" },
        {
          role: "user",
          content:
            'Your previous response was not valid JSON in the required format. Respond again with ONLY the JSON object: {"extractedField": string|null, "extractedValue": string|number|null, "nextQuestion": string|null, "isComplete": boolean}',
        },
      ]);
      extraction = parseExtraction(retryRaw);
    }
  } catch (err) {
    console.error("[Scriba] Groq call failed:", err);
    return NextResponse.json(
      {
        error:
          "The intake assistant is unavailable right now. Please try again in a moment.",
      },
      { status: 502 }
    );
  }

  if (!extraction) {
    return NextResponse.json(
      {
        error:
          "The intake assistant gave an unexpected response. Please try again.",
      },
      { status: 502 }
    );
  }

  // Merge server-side; completion is computed from real data, never from the
  // model's own claim.
  const updatedData = mergeExtraction(currentData, extraction);
  const isComplete = isDataComplete(updatedData);
  const nextQuestion = isComplete
    ? null
    : extraction.nextQuestion ?? fallbackQuestion(updatedData);

  return NextResponse.json({ updatedData, nextQuestion, isComplete });
}

