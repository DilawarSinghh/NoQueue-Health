import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// ─── System prompt — navigation only, no medical advice ──────────────────────
const SYSTEM_PROMPT = `You are the NoQueue Health site assistant. You help users navigate and understand the platform.

Platform overview:
- NoQueue Health is a two-sided marketplace connecting patients with hospital documentation agents in India.
- PATIENTS can: browse and book human documentation agents (by hospital/department/price/rating), post a help request, message agents directly, or use the AI Agent intake to self-report symptoms and generate a doctor-ready clinical summary PDF.
- AGENTS can: create service posts listing what documentation help they offer and their price, view incoming booking requests and accept/decline/complete them, browse patient help requests and proactively message patients, and manage their DM inbox.
- BOTH roles have a Messages section for direct chat with the other party.
- The AI Agent intake: patients answer symptom questions in a conversational chat (text or voice), the AI never diagnoses, the patient reviews all answers before a PDF is generated and emailed to the clinic.
- Onboarding: new users choose Agent or Patient after Google sign-in, then fill a short profile form. The role cannot be changed later.
- Booking flow: patient clicks "Book this agent" on an agent's post → agent sees the request in their Requests page → agent accepts/declines → once accepted, the patient can contact via WhatsApp or DM.

Your rules:
1. ONLY answer questions about how to use NoQueue Health — navigation, features, how booking/DMs/AI intake work.
2. If asked about medical symptoms, conditions, diagnoses, or health advice, respond with exactly: "I can help you navigate NoQueue Health — for medical questions, please use the AI Agent intake or contact a doctor directly."
3. Do NOT answer medical questions under any framing (hypothetical, general knowledge, "just curious", etc.).
4. Keep answers short and helpful — one or two sentences where possible.
5. Never reference or reveal specific patient intake_records content.`;

// ─── Models ───────────────────────────────────────────────────────────────────
const MODELS = [
  "llama-3.3-70b-versatile",
  "llama3-70b-8192",
  "mixtral-8x7b-32768",
];

// ─── Request schema ───────────────────────────────────────────────────────────
const requestSchema = z.object({
  message:  z.string().min(1).max(1000),
  threadId: z.string().uuid().nullable().optional(),
});

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  // Auth — user must be signed in
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { message, threadId: existingThreadId } = parsed.data;
  const admin = getSupabaseAdmin();

  // ── Find or create site_assistant thread for this user ──────────────────
  let threadId = existingThreadId ?? null;

  if (!threadId) {
    // Look for an existing site_assistant thread for this user
    const { data: existing } = await admin
      .from("threads")
      .select("id")
      .eq("type", "site_assistant")
      .eq("participant_a", user.id)
      .maybeSingle();

    if (existing) {
      threadId = existing.id;
    } else {
      const { data: created, error: threadErr } = await admin
        .from("threads")
        .insert({
          type:          "site_assistant",
          participant_a: user.id,
          participant_b: null,
        })
        .select("id")
        .single();

      if (threadErr) {
        return NextResponse.json({ error: threadErr.message }, { status: 500 });
      }
      threadId = created.id;
    }
  }

  // ── Persist the user message ──────────────────────────────────────────────
  await admin.from("messages").insert({
    thread_id:    threadId,
    sender_id:    user.id,
    is_assistant: false,
    content:      message,
  });

  // ── Fetch recent history for context (last 20 messages) ──────────────────
  const { data: history } = await admin
    .from("messages")
    .select("sender_id, is_assistant, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(20);

  const chatHistory: Groq.Chat.ChatCompletionMessageParam[] = (history ?? []).map((m) => ({
    role:    m.is_assistant ? "assistant" : "user",
    content: m.content,
  }));

  // ── Call Groq ─────────────────────────────────────────────────────────────
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "AI service not configured" }, { status: 500 });
  }

  const groq    = new Groq({ apiKey: process.env.GROQ_API_KEY });
  let aiReply   = "I'm having trouble connecting right now. Please try again in a moment.";
  let modelUsed = "";

  for (const model of MODELS) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...chatHistory,
        ],
        temperature: 0.3,
        max_tokens:  300,
      });
      const text = completion.choices[0]?.message?.content?.trim();
      if (text) { aiReply = text; modelUsed = model; break; }
    } catch {
      continue;
    }
  }

  // ── Persist AI reply (service role — sender_id null, is_assistant true) ──
  const { data: savedMsg, error: msgErr } = await admin
    .from("messages")
    .insert({
      thread_id:    threadId,
      sender_id:    null,
      is_assistant: true,
      content:      aiReply,
    })
    .select("id, created_at")
    .single();

  if (msgErr) {
    // Non-fatal — still return the reply to the user
    console.error("Failed to persist assistant message:", msgErr.message);
  }

  return NextResponse.json({
    reply:    aiReply,
    threadId,
    messageId: savedMsg?.id ?? null,
    model:    modelUsed,
  });
}

// ── GET — load thread history for a returning user ───────────────────────────
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ messages: [], threadId: null });

  const admin = getSupabaseAdmin();

  const { data: thread } = await admin
    .from("threads")
    .select("id")
    .eq("type", "site_assistant")
    .eq("participant_a", user.id)
    .maybeSingle();

  if (!thread) return NextResponse.json({ messages: [], threadId: null });

  const { data: messages } = await admin
    .from("messages")
    .select("id, sender_id, is_assistant, content, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true })
    .limit(50);

  return NextResponse.json({ messages: messages ?? [], threadId: thread.id });
}
