/**
 * lib/ai/gemini.ts
 *
 * Google Gemini provider implementation.
 * Uses the @google/generative-ai SDK.
 *
 * Docs: https://ai.google.dev/gemini-api/docs
 */

import type { AIRequest, AIResponse } from "./types";
import { parseAIOutput } from "@/lib/intakePrompt";

// Dynamic import to avoid bundling issues
async function getGeminiModel() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  return genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
    },
  });
}

export async function callGeminiProvider(
  request: AIRequest,
  systemPrompt: string,
  dataReminder: string
): Promise<{ response: AIResponse | null; model: string | null; error: string | null }> {
  const model = await getGeminiModel();
  const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  // Build conversation history for Gemini
  const history = request.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const chat = model.startChat({ history });

  try {
    // Send system prompt + data reminder + latest user message
    const latestMessage = `${systemPrompt}\n\n${dataReminder}`;
    const result = await chat.sendMessage(latestMessage);

    const raw = result.response.text();
    if (!raw || !raw.trim()) {
      return { response: null, model: modelName, error: "Empty response from Gemini" };
    }

    // Emergency fast-path
    if (raw.includes('"emergency":true')) {
      const parsed = parseAIOutput(raw);
      if (parsed?.emergency) return { response: parsed, model: modelName, error: null };
    }

    const parsed = parseAIOutput(raw);
    if (parsed) return { response: parsed, model: modelName, error: null };

    // Malformed — retry once with stricter instruction
    const retryResult = await chat.sendMessage(
      "Your last response was not valid JSON. Reply ONLY with the JSON object described in the system prompt. No markdown, no extra text."
    );
    const retryRaw = retryResult.response.text();
    if (retryRaw) {
      const retryParsed = parseAIOutput(retryRaw);
      if (retryParsed) return { response: retryParsed, model: modelName, error: null };
    }

    return { response: null, model: modelName, error: "Malformed response after retry" };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Unknown Gemini error";
    const statusCode =
      err != null && typeof err === "object" && "status" in err
        ? (err as { status?: number }).status
        : undefined;
    console.error(
      `[ai/gemini] Failed${statusCode ? ` (HTTP ${statusCode})` : ""}: ${errMsg}`
    );
    return { response: null, model: modelName, error: statusCode ? `HTTP ${statusCode} — ${errMsg}` : errMsg };
  }
}
