// groq.ts — Groq client setup + system prompt builder (Step 3)
//
// TODO(Step 3):
// - Create a Groq client (openai-compatible) pointed at Groq's endpoint:
//   new Groq({ apiKey: process.env.GROQ_API_KEY }) — server-only usage.
// - Model: "llama-3.3-70b-versatile" (or latest available equivalent).
// - buildSystemPrompt(clinicName): calm, friendly intake assistant for
//   {clinicName}. Ask schema fields ONE AT A TIME, in natural conversational
//   language, in schema order. Never ask outside the list. Never give
//   medical advice, opinions, or diagnoses. If an answer is unclear, ask a
//   brief clarifying follow-up before moving on. Respond ONLY with JSON:
//   { extractedField, extractedValue, nextQuestion, isComplete }.
// - Helper to call chat completions with JSON mode forced; parse
//   defensively (try/catch + Zod) and re-prompt once on failure.
export {}; // scaffold — implemented in Step 3
