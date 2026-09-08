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
import { providerDisplayName } from "@/lib/ai/types";

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

  // Build response with metadata — provider ids are mapped to patient-safe
  // "AI Agent N" labels so no real provider/model name reaches the browser.
  const response: Record<string, unknown> = {
    ...result.response,
    _meta: {
      provider: result.provider ? providerDisplayName(result.provider) : null,
      model: null, // never expose the concrete model name to the patient
      fallbackOccurred: result.fallbackOccurred,
      attempts: result.attempts.map((a) => ({
        provider: providerDisplayName(a.provider),
        success: a.success,
        durationMs: a.durationMs,
      })),
    },
  };

  // If fallback occurred, add a patient-friendly notice (no provider/error detail)
  if (result.fallbackOccurred && result.attempts.length > 0) {
    response.fallbackNotice = `Our advanced assistant hit a temporary issue, so we've switched you to another assistant to keep things moving.`;

    if (language === "hi") {
      response.fallbackNotice +=
        " Further responses will be in English if the fallback assistant does not support Hindi.";
    }

    response.fallbackOccurred = true;
  }

  return NextResponse.json(response);
}
