import Groq from "groq-sdk";

// groq.ts — thin Groq client factory. SERVER-ONLY.
// The full system prompt and model list live in lib/intakePrompt.ts (shared by both tiers).

let _client: Groq | null = null;

export function getGroqClient(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set.");
  }
  if (!_client) {
    _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _client;
}
