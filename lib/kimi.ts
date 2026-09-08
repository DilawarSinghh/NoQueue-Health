// lib/kimi.ts — Kimi K3 client singleton. SERVER-ONLY.
// Uses the `openai` npm package pointed at Cline's OpenAI-compatible gateway
// (api.cline.bot), which routes to Moonshot's Kimi K3 (and other providers)
// through one unified endpoint. Auth: CLINE_API_KEY env variable.
//
// Keys: app.cline.bot/dashboard/account?tab=api-keys
// API docs: docs.cline.bot/api
//
// Mirror of lib/groq.ts export shape so route code can swap clients with
// minimal diff — both export a singleton client function.

import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getKimiClient(): OpenAI {
  if (!process.env.CLINE_API_KEY) {
    throw new Error("CLINE_API_KEY is not set. Get a key at app.cline.bot/dashboard/account?tab=api-keys");
  }
  if (!_client) {
    _client = new OpenAI({
      apiKey:  process.env.CLINE_API_KEY,
      baseURL: "https://api.cline.bot/api/v1",
    });
  }
  return _client;
}

/**
 * Model identifier for Kimi K3 through Cline's gateway.
 * Format: provider/model-name (Cline convention, same as OpenRouter).
 *
 * Note: reasoning_effort is NOT passed — Cline's gateway does not document
 * it as a supported input parameter for Moonshot models. The gateway handles
 * reasoning internally; we don't control it from the client side here.
 */
export const KIMI_MODEL = "moonshotai/kimi-k3";
