import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import {
  buildSystemPrompt,
  buildDataReminder,
  intakeRequestSchema,
  parseAIOutput,
  type IntakeRequest,
} from "@/lib/intakePrompt";

// ─── Models tried in order — first success wins ───────────────────────────────
// Source: console.groq.com/docs/deprecations
const MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b",
];

// ─── Core Groq call (shared between first attempt + retry) ───────────────────
async function callGroq(
  groq: Groq,
  model: string,
  messages: Groq.Chat.ChatCompletionMessageParam[],
  maxTokens = 768
): Promise<string | null> {
  const res = await groq.chat.completions.create({
    model,
    messages,
    temperature:     0.3,
    max_tokens:      maxTokens,
    response_format: { type: "json_object" },
  });
  return res.choices[0]?.message?.content ?? null;
}

// ─── Main handler — exported so high/route.ts can call it as a fallback ──────
export async function runLowTier(body: IntakeRequest): Promise<NextResponse> {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY not set" }, { status: 503 });
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  // Low tier is English-only; ignore any language field from the request
  const systemPrompt   = buildSystemPrompt(body.patientContext, "en");
  const dataReminder   = buildDataReminder(body.currentStructuredData as Record<string, string>);

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system",    content: systemPrompt },
    ...body.conversationHistory.map((m) => ({
      role:    m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "system", content: dataReminder },
  ];

  let lastError = "All models failed";

  for (const model of MODELS) {
    try {
      const raw = await callGroq(groq, model, messages);
      if (!raw) { lastError = "Empty response"; continue; }

      // Emergency fast-path
      if (raw.includes('"emergency":true')) {
        const result = parseAIOutput(raw);
        if (result?.emergency) return NextResponse.json(result);
      }

      const result = parseAIOutput(raw);
      if (result) return NextResponse.json(result);

      // Malformed — re-prompt once with stricter instruction
      const retryMessages: Groq.Chat.ChatCompletionMessageParam[] = [
        ...messages,
        { role: "assistant", content: raw },
        {
          role:    "user",
          content: "Your last response was not valid JSON. Reply ONLY with the JSON object described in the system prompt. No markdown, no extra text.",
        },
      ];
      const retryRaw = await callGroq(groq, model, retryMessages, 768);
      if (retryRaw) {
        const retryResult = parseAIOutput(retryRaw);
        if (retryResult) return NextResponse.json(retryResult);
      }

      lastError = "Malformed AI response after retry";
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown Groq error";
      const statusCode =
        err != null && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : undefined;
      console.error(
        `[ai-intake/low] Groq model ${model} failed${statusCode ? ` (HTTP ${statusCode})` : ""}: ${errMsg}`
      );
      lastError = statusCode ? `HTTP ${statusCode} — ${errMsg}` : errMsg;
      continue;
    }
  }

  console.error(`[ai-intake/low] All models failed. Last error: ${lastError}`);
  return NextResponse.json({ error: lastError }, { status: 502 });
}

// ─── Route export ─────────────────────────────────────────────────────────────
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = intakeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return runLowTier(parsed.data);
}
