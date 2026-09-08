/**
 * lib/ai/router.ts
 *
 * Provider router with automatic fallback.
 * Tries providers in order; on failure, falls back to the next one.
 */

import type { AIRequest, AIResponse, AIProviderId, ProviderResult } from "./types";
import { callMiniMaxProvider } from "./minimax";
import { callGeminiProvider } from "./gemini";
import { callGroqProvider } from "./groq";

/** Provider call function signature. */
type ProviderFn = (
  request: AIRequest,
  systemPrompt: string,
  dataReminder: string
) => Promise<{ response: AIResponse | null; model: string | null; error: string | null }>;

/** Provider chain entry. */
interface ProviderEntry {
  id: AIProviderId;
  fn: ProviderFn;
  available: boolean;
}

/** Build the provider chain based on which API keys are configured. */
function getProviderChain(): ProviderEntry[] {
  const chain: ProviderEntry[] = [
    {
      id: "minimax-m3",
      fn: callMiniMaxProvider,
      available: !!process.env.XKIRO_API_KEY,
    },
    {
      id: "gemini",
      fn: callGeminiProvider,
      available: !!process.env.GEMINI_API_KEY,
    },
    {
      id: "groq",
      fn: callGroqProvider,
      available: !!process.env.GROQ_API_KEY,
    },
  ];
  return chain.filter((p): p is ProviderEntry => p.available);
}

export interface RouterResult {
  response: AIResponse | null;
  /** The provider that ultimately succeeded. */
  provider: AIProviderId | null;
  /** The model that was used (e.g. "openai/gpt-oss-120b"). */
  model: string | null;
  /** Whether a fallback occurred (true if not the first provider tried). */
  fallbackOccurred: boolean;
  /** All providers that were attempted, in order. */
  attempts: ProviderResult[];
  /** Error message if all providers failed. */
  error: string | null;
}

/**
 * Route a request through the provider chain with automatic fallback.
 *
 * @param request        - The AI request (messages, patient context, etc.)
 * @param systemPrompt   - The full system prompt string
 * @param dataReminder   - The data reminder string (current collected data)
 * @param preferredOrder - Optional custom provider order (from user selection)
 */
export async function routeAIRequest(
  request: AIRequest,
  systemPrompt: string,
  dataReminder: string,
  preferredOrder?: AIProviderId[]
): Promise<RouterResult> {
  let chain = getProviderChain();

  // If a preferred order is specified, reorder the chain to try that first
  if (preferredOrder && preferredOrder.length > 0) {
    const ordered: ProviderEntry[] = [];
    for (const id of preferredOrder) {
      const provider = chain.find((p) => p.id === id);
      if (provider) ordered.push(provider);
    }
    // Add any remaining providers not in the preferred order
    for (const provider of chain) {
      if (!ordered.find((p) => p.id === provider.id)) {
        ordered.push(provider);
      }
    }
    chain = ordered;
  }

  if (chain.length === 0) {
    return {
      response: null,
      provider: null,
      model: null,
      fallbackOccurred: false,
      attempts: [],
      error: "No AI providers configured. Set at least one of: XKIRO_API_KEY, GEMINI_API_KEY, GROQ_API_KEY.",
    };
  }

  const attempts: ProviderResult[] = [];
  let firstProvider = chain[0].id;

  for (const entry of chain) {
    const start = Date.now();
    try {
      const { response, model, error } = await entry.fn(request, systemPrompt, dataReminder);
      const durationMs = Date.now() - start;

      if (response) {
        const successAttempt: ProviderResult = {
          success: true,
          provider: entry.id,
          model: model ?? undefined,
          durationMs,
        };
        return {
          response,
          provider: entry.id,
          model,
          fallbackOccurred: entry.id !== firstProvider,
          attempts: [...attempts, successAttempt],
          error: null,
        };
      }

      attempts.push({
        success: false,
        provider: entry.id,
        error: error ?? "Unknown error",
        durationMs,
      });
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[ai/router] Provider ${entry.id} threw: ${errMsg}`);
      attempts.push({
        success: false,
        provider: entry.id,
        error: errMsg,
        durationMs,
      });
    }
  }

  // All providers failed
  const lastError = attempts[attempts.length - 1]?.error ?? "All providers failed";
  return {
    response: null,
    provider: null,
    model: null,
    fallbackOccurred: attempts.length > 1,
    attempts,
    error: lastError,
  };
}
