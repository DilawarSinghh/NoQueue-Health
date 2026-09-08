// lib/kimi.ts — Kimi K3 client singleton. SERVER-ONLY.
// Uses the `openai` npm package pointed at Moonshot's OpenAI-compatible endpoint.
// Auth: KIMI_API_KEY env variable (never exposed to the client).
//
// Keys: https://platform.kimi.ai
// API docs: https://platform.kimi.ai/docs
//
// Mirror of lib/groq.ts export shape so route code can swap clients with
// minimal diff — both export getClient() returning an OpenAI-compatible client.

import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getKimiClient(): OpenAI {
  if (!process.env.KIMI_API_KEY) {
    throw new Error("KIMI_API_KEY is not set. Get a key at https://platform.kimi.ai");
  }
  if (!_client) {
    _client = new OpenAI({
      apiKey:  process.env.KIMI_API_KEY,
      baseURL: "https://api.moonshot.ai/v1",
    });
  }
  return _client;
}

/**
 * Model identifier for Kimi K3 on the Moonshot endpoint.
 * reasoning_effort: "low" — this is a conversational intake flow, not deep
 * reasoning, so "low" avoids the latency/cost of the default "max" setting.
 */
export const KIMI_MODEL = "kimi-k3";
export const KIMI_REASONING_EFFORT = "low" as const;
