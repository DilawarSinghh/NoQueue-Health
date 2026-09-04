import { NextResponse } from "next/server";

// POST /api/chat — Step 3 (server-side only)
//
// TODO(Step 3):
// - Receives: { conversation: Array<{role, content}>, currentData: Partial<PatientIntake> }.
// - Build system prompt via lib/groq.ts buildSystemPrompt(clinicName):
//   instructs model to ask schema fields ONE AT A TIME, in order, no medical
//   advice, and to respond with JSON:
//   { extractedField, extractedValue, nextQuestion, isComplete }.
// - Call Groq (llama-3.3-70b-versatile) with JSON mode forced; parse
//   defensively (try/catch + Zod) and re-prompt once on failure.
// - Validate extractedField/extractedValue against the Zod schema BEFORE
//   accepting; merge into running structured data server-side.
// - Return: { updatedData, nextQuestion, isComplete }.
// - SECURITY: GROQ_API_KEY is server-only. Validate all client input with
//   the Zod schema at this boundary (spec §6).
export async function POST(request: Request) {
  return NextResponse.json(
    { error: "Not implemented yet — Step 3" },
    { status: 501 }
  );
}
