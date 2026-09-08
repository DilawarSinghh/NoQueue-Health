/**
 * app/api/ai-intake/chat/route.ts
 *
 * Unified AI intake endpoint — replaces the old /low and /high split.
 * Routes through the provider chain (MiniMax → Gemini → Groq) with automatic fallback.
 *
 * Request body:
 *   conversationHistory, patientContext, currentStructuredData, language, preferredProvider?
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildSystemPrompt,
  buildDataReminder,
  intakeRequestSchema,
  type IntakeRequest,
} from "@/lib/intakePrompt";
import { routeAIRequest } from "@/lib/ai/router";

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Extend schema with optional preferredProvider
  const schema = intakeRequestSchema.extend({
    preferredProvider: z.enum(["minimax-m3", "gemini", "groq"]).optional(),
  });

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const {
    conversationHistory,
    patientContext,
    currentStructuredData,
    language,
    preferredProvider,
  } = data;

  // Build prompts (shared logic)
  const systemPrompt = buildSystemPrompt(patientContext, language);
  const dataReminder = buildDataReminder(currentStructuredData as Record<string, string>);

  // Build AI request
  const aiRequest = {
    messages: conversationHistory,
    patientContext,
    currentStructuredData: currentStructuredData as Record<string, string>,
    language,
  };

  // Route through provider chain
  const result = await routeAIRequest(
    aiRequest,
    systemPrompt,
    dataReminder,
    preferredProvider ? [preferredProvider] : undefined
  );

  if (!result.response) {
    return NextResponse.json(
      { error: result.error || "All AI providers failed" },
      { status: 502 }
    );
  }

  // Build response with metadata
  const response: Record<string, unknown> = {
    ...result.response,
    _meta: {
      provider: result.provider,
      model: result.model,
      fallbackOccurred: result.fallbackOccurred,
      attempts: result.attempts.map((a) => ({
        provider: a.provider,
        success: a.success,
        error: a.error,
        durationMs: a.durationMs,
      })),
    },
  };

  // If fallback occurred, add a patient-friendly notice
  if (result.fallbackOccurred && result.attempts.length > 0) {
    const firstAttempt = result.attempts[0];
    const shortReason = firstAttempt.error
      ? firstAttempt.error.length > 100
        ? firstAttempt.error.slice(0, 100) + "…"
        : firstAttempt.error
      : "temporarily unavailable";

    response.fallbackNotice = `The selected AI model (${firstAttempt.provider}) is ${shortReason}. We've switched you to another model so you can continue.`;

    if (language === "hi") {
      response.fallbackNotice +=
        " Further responses will be in English if the fallback model doesn't support Hindi.";
    }

    response.fallbackOccurred = true;
  }

  return NextResponse.json(response);
}
