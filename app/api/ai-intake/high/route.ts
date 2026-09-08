import { NextResponse } from "next/server";
import type OpenAI from "openai";
import { getKimiClient, KIMI_MODEL, KIMI_REASONING_EFFORT } from "@/lib/kimi";
import {
  buildSystemPrompt,
  buildDataReminder,
  intakeRequestSchema,
  parseAIOutput,
  type IntakeRequest,
} from "@/lib/intakePrompt";
import { runLowTier } from "@/app/api/ai-intake/low/route";

// ─── Kimi K3 call ─────────────────────────────────────────────────────────────
async function callKimi(
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Promise<string | null> {
  const kimi = getKimiClient();

  // reasoning_effort is a Moonshot extension — cast through unknown to avoid
  // TS strictness on the standard OpenAI type that doesn't declare it.
  const res = await (kimi.chat.completions.create as (
    params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & { reasoning_effort?: string }
  ) => Promise<OpenAI.Chat.ChatCompletion>)({
    model:            KIMI_MODEL,
    messages,
    temperature:      0.3,
    max_tokens:       1024,          // Kimi K3 produces slightly more verbose output
    response_format:  { type: "json_object" },
    reasoning_effort: KIMI_REASONING_EFFORT,
  });

  return res.choices[0]?.message?.content ?? null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
async function runHighTier(body: IntakeRequest): Promise<NextResponse> {
  if (!process.env.KIMI_API_KEY) {
    // No key configured — fall back immediately with a clear notice
    console.warn("[ai-intake/high] KIMI_API_KEY not set — falling back to Low tier");
    const fallbackRes = await runLowTier(body);
    const fallbackJson = await fallbackRes.json();
    return NextResponse.json({
      ...fallbackJson,
      fallbackOccurred: true,
      fallbackNotice:
        "Our advanced assistant (Kimi K3) is not configured on this server, so we've switched you to our standard assistant to keep things moving." +
        (body.language === "hi" ? " Further responses will be in English." : ""),
    });
  }

  const systemPrompt = buildSystemPrompt(body.patientContext, body.language);
  const dataReminder = buildDataReminder(body.currentStructuredData as Record<string, string>);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system",    content: systemPrompt },
    ...body.conversationHistory.map((m) => ({
      role:    m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "system", content: dataReminder },
  ];

  // ── Attempt Kimi K3 ────────────────────────────────────────────────────────
  let kimiErrorReason = "unknown error";

  try {
    const raw = await callKimi(messages);

    if (raw) {
      // Emergency fast-path
      if (raw.includes('"emergency":true')) {
        const result = parseAIOutput(raw);
        if (result?.emergency) return NextResponse.json(result);
      }

      const result = parseAIOutput(raw);
      if (result) return NextResponse.json(result);

      // Malformed — retry once with stricter instruction
      const retryMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        ...messages,
        { role: "assistant", content: raw },
        {
          role:    "user",
          content:
            "Your last response was not valid JSON. Reply ONLY with the JSON object described in the system prompt. No markdown, no extra text.",
        },
      ];
      const retryRaw = await callKimi(retryMessages);
      if (retryRaw) {
        const retryResult = parseAIOutput(retryRaw);
        if (retryResult) return NextResponse.json(retryResult);
      }

      kimiErrorReason = "malformed response after retry";
    } else {
      kimiErrorReason = "empty response";
    }
  } catch (err: unknown) {
    // Log the full Moonshot error for server-side debugging
    const errMsg = err instanceof Error ? err.message : String(err);
    const statusCode =
      err != null && typeof err === "object" && "status" in err
        ? (err as { status?: number }).status
        : undefined;

    console.error(
      `[ai-intake/high] Kimi K3 error${statusCode ? ` (HTTP ${statusCode})` : ""}: ${errMsg}`
    );
    kimiErrorReason = statusCode ? `HTTP ${statusCode} — ${errMsg}` : errMsg;
  }

  // ── Kimi failed — fall back to Low tier (Groq) ────────────────────────────
  console.warn(`[ai-intake/high] Falling back to Low tier. Reason: ${kimiErrorReason}`);

  const fallbackRes  = await runLowTier(body);
  const fallbackJson = (await fallbackRes.json()) as Record<string, unknown>;

  const shortReason = kimiErrorReason.length > 120
    ? kimiErrorReason.slice(0, 120) + "…"
    : kimiErrorReason;

  const hindiNote =
    body.language === "hi"
      ? " Further responses will be in English because our standard assistant does not support Hindi."
      : "";

  return NextResponse.json({
    ...fallbackJson,
    fallbackOccurred: true,
    fallbackNotice:
      `Our advanced assistant (Kimi K3) hit an error (${shortReason}), so we've switched you to our standard assistant to keep things moving.${hindiNote}`,
  });
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

  return runHighTier(parsed.data);
}
