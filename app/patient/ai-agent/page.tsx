"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Bot, CheckCircle2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  useIntakeStore,
  type ChatMessage,
} from "@/lib/store";
import {
  type PatientContext,
  countCollectedFields,
  INTAKE_FIELD_ORDER,
} from "@/lib/schema";

// ─── Emergency banner ────────────────────────────────────────────────────────

function EmergencyBanner({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 border-red-500 bg-red-50 p-5"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-600" aria-hidden="true" />
        <div>
          <p className="text-lg font-bold text-red-700">Emergency — Seek Immediate Care</p>
          <p className="mt-1 text-red-700">{message}</p>
          <a
            href="tel:112"
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
          >
            📞 Call Emergency Services (112)
          </a>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Progress bar ────────────────────────────────────────────────────────────

function ProgressBar({ collected }: { collected: number }) {
  const total = INTAKE_FIELD_ORDER.length;
  const pct   = Math.round((collected / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{collected} of {total} fields collected</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/40">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AIAgentPage() {
  const router = useRouter();

  const {
    consented, setConsented,
    patientContext, setPatientContext,
    data, setData,
    conversation, addMessage,
    reset,
  } = useIntakeStore();

  const [profileLoading, setProfileLoading] = useState(true);
  const [started, setStarted]               = useState(false);
  const [input, setInput]                   = useState("");
  const [aiLoading, setAiLoading]           = useState(false);
  const [emergency, setEmergency]           = useState<string | null>(null);
  const [apiError, setApiError]             = useState<string | null>(null);
  const [isComplete, setIsComplete]         = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, aiLoading]);

  // Load patient profile
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/"); return; }

      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, patient_profiles(age, gender, allergies, chronic_conditions)")
        .eq("id", user.id)
        .maybeSingle();

      if (prof) {
        const pp = Array.isArray(prof.patient_profiles)
          ? prof.patient_profiles[0]
          : prof.patient_profiles;

        const ctx: PatientContext = {
          name:              (prof.full_name as string | null) ?? user.email ?? "Patient",
          age:               pp?.age               ?? null,
          gender:            pp?.gender            ?? null,
          allergies:         pp?.allergies         ?? null,
          chronicConditions: (pp as { chronic_conditions?: string | null } | null)?.chronic_conditions ?? null,
        };
        setPatientContext(ctx);
      }
      setProfileLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send a message to the AI
  const sendMessage = async (userText: string) => {
    if (!userText.trim() || aiLoading || emergency) return;

    const userMsg: ChatMessage = { role: "user", content: userText.trim() };
    addMessage(userMsg);
    setInput("");
    setAiLoading(true);
    setApiError(null);

    try {
      const res = await fetch("/api/ai-intake", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationHistory:   [...conversation, userMsg],
          patientContext,
          currentStructuredData: data,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setApiError(json?.error ?? "AI service unavailable. Please try again.");
        setAiLoading(false);
        return;
      }

      // Emergency — halt everything
      if (json.emergency === true) {
        setEmergency(json.message);
        setAiLoading(false);
        return;
      }

      // Merge updated structured data
      if (json.updatedData) {
        setData({ ...data, ...json.updatedData });
      }

      if (json.isComplete) {
        setIsComplete(true);
        addMessage({
          role:    "assistant",
          content: json.nextQuestion ?? "Thanks — I have everything I need. Please review your information below.",
        });
      } else if (json.nextQuestion) {
        addMessage({ role: "assistant", content: json.nextQuestion });
      }
    } catch {
      setApiError("Network error — please check your connection and try again.");
    }

    setAiLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Kick off the intake with the first question
  const handleStart = async () => {
    if (!consented) return;
    reset();
    // Re-apply consent + context after reset
    setConsented(true);
    if (patientContext) setPatientContext(patientContext);
    setStarted(true);
    setIsComplete(false);
    setEmergency(null);
    setApiError(null);

    // Prime the conversation with a silent user trigger
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai-intake", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationHistory:   [{ role: "user", content: "Hello, I'd like to start my intake." }],
          patientContext,
          currentStructuredData: {},
        }),
      });
      const json = await res.json();
      if (json.nextQuestion) {
        addMessage({ role: "user",      content: "Hello, I'd like to start my intake." });
        addMessage({ role: "assistant", content: json.nextQuestion });
      }
    } catch {
      setApiError("Could not connect to AI. Please try again.");
    }
    setAiLoading(false);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const collected = countCollectedFields(data);

  // ── Pre-start screen ──────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <GlassCard className="p-6 sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bot className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">AI Intake Agent</h1>
            <p className="mt-2 text-muted-foreground">
              Answer a few questions about your symptoms and I&apos;ll prepare a
              doctor-ready summary — no repeated basics.
            </p>

            {/* What we already know */}
            {!profileLoading && patientContext && (
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                  Already on file — won&apos;t be re-asked
                </p>
                <ul className="space-y-0.5 text-sm text-muted-foreground">
                  <li>Name: {patientContext.name}</li>
                  {patientContext.age               && <li>Age: {patientContext.age}</li>}
                  {patientContext.gender            && <li>Gender: {patientContext.gender}</li>}
                  {patientContext.allergies         && <li>Allergies: {patientContext.allergies}</li>}
                  {patientContext.chronicConditions && <li>Conditions: {patientContext.chronicConditions}</li>}
                </ul>
              </div>
            )}

            {/* Consent */}
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-white/40 bg-white/40 p-4">
              <Checkbox
                id="consent"
                checked={consented}
                onCheckedChange={(v) => setConsented(!!v)}
                className="mt-0.5"
              />
              <Label htmlFor="consent" className="cursor-pointer text-sm leading-relaxed">
                I understand this AI intake collects symptom information to help prepare a
                clinical summary. I consent to this data being used to generate a report
                shared with a healthcare provider. This is not a medical consultation.
              </Label>
            </div>

            <Button
              className="mt-6 w-full"
              size="lg"
              disabled={!consented || profileLoading}
              onClick={handleStart}
            >
              {profileLoading ? "Loading your profile…" : "Start intake"}
            </Button>
          </GlassCard>
        </motion.div>
      </div>
    );
  }

  // ── Chat screen ───────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Progress */}
      <GlassCard className="p-4">
        <ProgressBar collected={collected} />
      </GlassCard>

      {/* Emergency banner */}
      {emergency && <EmergencyBanner message={emergency} />}

      {/* Chat window */}
      <GlassCard className="flex h-[60dvh] flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto space-y-3 p-4">
          {conversation.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/70 text-foreground shadow-sm"
                }`}
              >
                {msg.role === "assistant" && (
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary/60">
                    <Bot className="h-3 w-3" /> AI Agent
                  </p>
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </motion.div>
          ))}

          {/* Typing indicator */}
          <AnimatePresence>
            {aiLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex justify-start"
              >
                <div className="rounded-2xl bg-white/70 px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-2 w-2 rounded-full bg-primary/40 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        {!emergency && !isComplete && (
          <div className="border-t border-white/40 p-3">
            {apiError && (
              <p className="mb-2 text-xs text-destructive" role="alert">{apiError}</p>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Type your answer…"
                aria-label="Your answer"
                disabled={aiLoading}
                className="flex-1 rounded-xl border border-input bg-white/60 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 placeholder:text-muted-foreground disabled:opacity-50"
              />
              <Button
                size="icon"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || aiLoading}
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Complete — go to review */}
      {isComplete && !emergency && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <GlassCard className="flex flex-col items-center gap-4 p-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-teal-600" aria-hidden="true" />
            <div>
              <p className="font-semibold">Intake complete</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Review your information and generate your doctor-ready report.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => router.push("/patient/ai-agent/review")}
              className="w-full sm:w-auto"
            >
              Review &amp; generate report
            </Button>
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
}
