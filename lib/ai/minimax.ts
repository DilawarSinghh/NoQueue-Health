/**
 * lib/ai/minimax.ts
 *
 * MiniMax M3 provider implementation.
 * Uses the OpenAI SDK pointed at xkiro.com's OpenAI-compatible endpoint.
 *
 * Docs: https://api.xkiro.com
 */

import OpenAI from "openai";
import type { AIRequest, AIResponse } from "./types";
import { parseAIOutput } from "@/lib/intakePrompt";

const DEFAULT_BASE_URL = "https://api.xkiro.com/v1";
const DEFAULT_MODEL = "minimax/minimax-m3:free";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!process.env.XKIRO_API_KEY) {
    throw new Error("XKIRO_API_KEY is not set");
  }
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.XKIRO_API_KEY,
      baseURL: process.env.XKIRO_BASE_URL || DEFAULT_BASE_URL,
    });
  }
  return _client;
}

export async function callMiniMaxProvider(
  request: AIRequest,
  systemPrompt: string,
  dataReminder: string
): Promise<{ response: AIResponse | null; model: string | null; error: string | null }> {
  const client = getClient();
  const model = process.env.MINIMAX_MODEL || DEFAULT_MODEL;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...request.messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
    { role: "system", content: dataReminder },
  ];

  try {
    const res = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    });

    const raw = res.choices[0]?.message?.content;
    if (!raw) {
      return { response: null, model, error: "Empty response from MiniMax" };
    }

    // Emergency fast-path
    if (raw.includes('"emergency":true')) {
      const result = parseAIOutput(raw);
      if (result?.emergency) return { response: result, model, error: null };
    }

    const result = parseAIOutput(raw);
    if (result) return { response: result, model, error: null };

    // Malformed — retry once with stricter instruction
    const retryMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...messages,
      { role: "assistant", content: raw },
      {
        role: "user",
        content:
          "Your last response was not valid JSON. Reply ONLY with the JSON object described in the system prompt. No markdown, no extra text.",
      },
    ];
    const retryRes = await client.chat.completions.create({
      model,
      messages: retryMessages,
      temperature: 0.1,
      max_tokens: 768,
      response_format: { type: "json_object" },
    });
    const retryRaw = retryRes.choices[0]?.message?.content;
    if (retryRaw) {
      const retryResult = parseAIOutput(retryRaw);
      if (retryResult) return { response: retryResult, model, error: null };
    }

    return { response: null, model, error: "Malformed response after retry" };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Unknown MiniMax error";
    const statusCode =
      err != null && typeof err === "object" && "status" in err
        ? (err as { status?: number }).status
        : undefined;
    console.error(
      `[ai/minimax] Failed${statusCode ? ` (HTTP ${statusCode})` : ""}: ${errMsg}`
    );
    return { response: null, model, error: statusCode ? `HTTP ${statusCode} — ${errMsg}` : errMsg };
  }
}
