/**
 * lib/ai/groq.ts
 *
 * Groq provider implementation.
 * Uses the groq-sdk with openai/gpt-oss-120b (fallback to qwen/qwen3.6-27b).
 */

import Groq from "groq-sdk";
import type { AIRequest, AIResponse } from "./types";
import { parseAIOutput } from "@/lib/intakePrompt";

const MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.6-27b"];

let _client: Groq | null = null;

function getClient(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set");
  }
  if (!_client) {
    _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _client;
}

async function callGroq(
  groq: Groq,
  model: string,
  messages: Groq.Chat.ChatCompletionMessageParam[],
  maxTokens = 768
): Promise<string | null> {
  const res = await groq.chat.completions.create({
    model,
    messages,
    temperature: 0.3,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
  });
  return res.choices[0]?.message?.content ?? null;
}

export async function callGroqProvider(
  request: AIRequest,
  systemPrompt: string,
  dataReminder: string
): Promise<{ response: AIResponse | null; model: string | null; error: string | null }> {
  const groq = getClient();

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...request.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "system", content: dataReminder },
  ];

  let lastError = "All models failed";

  for (const model of MODELS) {
    try {
      const raw = await callGroq(groq, model, messages);
      if (!raw) {
        lastError = "Empty response";
        continue;
      }

      // Emergency fast-path
      if (raw.includes('"emergency":true')) {
        const result = parseAIOutput(raw);
        if (result?.emergency) return { response: result, model, error: null };
      }

      const result = parseAIOutput(raw);
      if (result) return { response: result, model, error: null };

      // Malformed — re-prompt once with stricter instruction
      const retryMessages: Groq.Chat.ChatCompletionMessageParam[] = [
        ...messages,
        { role: "assistant", content: raw },
        {
          role: "user",
          content:
            "Your last response was not valid JSON. Reply ONLY with the JSON object described in the system prompt. No markdown, no extra text.",
        },
      ];
      const retryRaw = await callGroq(groq, model, retryMessages, 768);
      if (retryRaw) {
        const retryResult = parseAIOutput(retryRaw);
        if (retryResult) return { response: retryResult, model, error: null };
      }

      lastError = "Malformed AI response after retry";
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown Groq error";
      const statusCode =
        err != null && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : undefined;
      console.error(
        `[ai/groq] Model ${model} failed${statusCode ? ` (HTTP ${statusCode})` : ""}: ${errMsg}`
      );
      lastError = statusCode ? `HTTP ${statusCode} — ${errMsg}` : errMsg;
      continue;
    }
  }

  return { response: null, model: null, error: lastError };
}
