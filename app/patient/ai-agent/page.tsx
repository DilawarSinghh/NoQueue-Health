"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  History,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useIntakeStore, type ChatMessage, type IntakeTier, type IntakeLanguage } from "@/lib/store";
import {
  type PatientContext,
  countCollectedFields,
  INTAKE_FIELD_ORDER,
} from "@/lib/schema";
import { useVoiceInput, type VoiceLang } from "@/lib/hooks/useVoiceInput";
import { useVoiceSpeech } from "@/lib/hooks/useVoiceSpeech";

type InputMode = "text" | "voice";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function voiceLang(language: IntakeLanguage): VoiceLang {
  return language === "hi" ? "hi-IN" : "en-IN";
}

function apiEndpoint(tier: IntakeTier): string {
  return tier === "high" ? "/api/ai-intake/high" : "/api/ai-intake/low";
}

/**
 * Extracts a readable error message from an API error response.
 * Zod validation errors return {formErrors, fieldErrors} — we flatten those
 * into a single string. String errors are passed through as-is.
 */
function extractErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error != null && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    // Zod validation error shape: { formErrors: string[], fieldErrors: Record<string, string[]> }
    if ("fieldErrors" in obj || "formErrors" in obj) {
      const fieldErrors = (obj.fieldErrors as Record<string, string[]>) ?? {};
      const formErrors = (obj.formErrors as string[]) ?? [];
      const messages = [
        ...formErrors,
        ...Object.values(fieldErrors).flat(),
      ].filter(Boolean);
      return messages.length > 0 ? messages.join(". ") : "Invalid request. Please try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

// ─── Emergency banner ─────────────────────────────────────────────────────────
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

// ─── Progress bar ─────────────────────────────────────────────────────────────
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

// ─── Tier picker ──────────────────────────────────────────────────────────────
function TierPicker({
  selected,
  onSelect,
}: {
  selected: IntakeTier;
  onSelect: (t: IntakeTier) => void;
}) {
  const tiers: {
    id:       IntakeTier;
    icon:     React.ElementType;
    label:    string;
    badge:    string;
    features: string[];
  }[] = [
    {
      id:       "low",
      icon:     Zap,
      label:    "Standard",
      badge:    "Fast · English",
      features: [
        "Text chat only",
        "English responses",
        "Powered by Groq (fast)",
      ],
    },
    {
      id:       "high",
      icon:     Sparkles,
      label:    "Advanced",
      badge:    "Voice · Hindi supported",
      features: [
        "Voice input & text",
        "Hindi or English",
        "Powered by Kimi K3",
      ],
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tiers.map(({ id, icon: Icon, label, badge, features }) => {
        const active = selected === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`flex flex-col gap-3 rounded-2xl border p-5 text-left transition-all ${
              active
                ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                : "border-white/40 bg-white/60 hover:bg-white/80"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  active ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className={`font-semibold ${active ? "text-primary" : ""}`}>{label}</p>
                <p className="text-xs text-muted-foreground">{badge}</p>
              </div>
              {active && (
                <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              )}
            </div>
            <ul className="space-y-1">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-1 w-1 rounded-full bg-current shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </button>
        );
      })}
    </div>
  );
}

// ─── Language toggle (High tier only) ────────────────────────────────────────
function LanguageToggle({
  language,
  onChange,
}: {
  language: IntakeLanguage;
  onChange: (l: IntakeLanguage) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Language:</span>
      <div className="flex gap-1 rounded-xl border border-white/40 bg-white/40 p-1">
        {(["en", "hi"] as IntakeLanguage[]).map((l) => (
          <button
            key={l}
            onClick={() => onChange(l)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              language === l
                ? "bg-white shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l === "en" ? "English" : "हिंदी"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Mode toggle ──────────────────────────────────────────────────────────────
function ModeToggle({
  mode,
  onToggle,
  voiceSupported,
  tierIsHigh,
}: {
  mode: InputMode;
  onToggle: (m: InputMode) => void;
  voiceSupported: boolean;
  tierIsHigh: boolean;
}) {
  const voiceAvailable = voiceSupported && tierIsHigh;
  return (
    <div className="flex w-fit gap-1 rounded-xl border border-white/40 bg-white/40 p-1 backdrop-blur-sm">
      {(["text", "voice"] as InputMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onToggle(m)}
          disabled={m === "voice" && !voiceAvailable}
          title={
            m === "voice" && !tierIsHigh
              ? "Voice is only available on the Advanced tier"
              : m === "voice" && !voiceSupported
              ? "Voice not supported in this browser"
              : undefined
          }
          className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            mode === m
              ? "bg-white shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {m === "text" ? <Send className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          {m === "text" ? "Text" : "Voice"}
        </button>
      ))}
    </div>
  );
}

// ─── Voice panel ──────────────────────────────────────────────────────────────
function VoicePanel({
  listening, speaking, transcript, interim, inputError,
  onStartListening, onStopListening, onStopSpeaking, onSubmit,
  onTranscriptChange, disabled, language,
}: {
  listening:          boolean;
  speaking:           boolean;
  transcript:         string;
  interim:            string;
  inputError:         string | null;
  onStartListening:   () => void;
  onStopListening:    () => void;
  onStopSpeaking:     () => void;
  onSubmit:           (text: string) => void;
  onTranscriptChange: (t: string) => void;
  disabled:           boolean;
  language:           IntakeLanguage;
}) {
  const placeholder = language === "hi"
    ? (listening ? "सुन रहा हूँ… अभी बोलें" : "बोलने के लिए माइक दबाएं")
    : (listening ? "Listening… speak now" : "Press the mic to start speaking");

  return (
    <div className="border-t border-white/40 p-4 space-y-3">
      <div className="grid gap-1.5">
        <Label htmlFor="voice-transcript" className="text-xs text-muted-foreground">
          {language === "hi" ? "आपका जवाब" : "Your answer"}{" "}
          {listening && <span className="text-red-500 animate-pulse">● {language === "hi" ? "रिकॉर्डिंग…" : "Recording…"}</span>}
        </Label>
        <div className="relative">
          <textarea
            id="voice-transcript"
            value={transcript + (interim ? ` ${interim}` : "")}
            onChange={(e) => onTranscriptChange(e.target.value)}
            rows={2}
            placeholder={placeholder}
            className="w-full resize-none rounded-xl border border-input bg-white/60 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 placeholder:text-muted-foreground"
            aria-label={language === "hi" ? "वॉयस ट्रांसक्रिप्ट" : "Voice transcript — editable"}
          />
          {interim && (
            <span className="absolute bottom-2 right-3 text-xs text-muted-foreground/60 italic">
              {interim}
            </span>
          )}
        </div>
        {inputError && <p className="text-xs text-destructive" role="alert">{inputError}</p>}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={listening ? onStopListening : onStartListening}
          disabled={disabled}
          aria-label={listening
            ? (language === "hi" ? "रिकॉर्डिंग बंद करें" : "Stop recording")
            : (language === "hi" ? "रिकॉर्डिंग शुरू करें" : "Start recording")}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-all disabled:opacity-50 ${
            listening
              ? "bg-red-500 text-white shadow-lg shadow-red-200 animate-pulse"
              : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
        >
          {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>

        {speaking && (
          <button
            onClick={onStopSpeaking}
            aria-label={language === "hi" ? "AI को रोकें" : "Stop AI speaking"}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-600 hover:bg-amber-200"
          >
            <VolumeX className="h-4 w-4" />
          </button>
        )}
        {speaking && !listening && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Volume2 className="h-3.5 w-3.5 text-primary animate-pulse" />
            {language === "hi" ? "AI बोल रहा है…" : "AI is speaking…"}
          </span>
        )}

        <Button
          className="ml-auto gap-2"
          onClick={() => { onStopListening(); onSubmit(transcript.trim()); }}
          disabled={!transcript.trim() || disabled}
        >
          <Send className="h-4 w-4" />
          {language === "hi" ? "भेजें" : "Submit"}
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AIAgentPage() {
  const router = useRouter();

  const {
    tier, setTier,
    language, setLanguage,
    fallbackOccurred, setFallbackOccurred,
    consented, setConsented,
    patientContext, setPatientContext,
    data, setData,
    conversation, addMessage,
    setRecommendedDepartment,
    setRecommendedDepartmentReason,
    setAlternateDepartment,
    setSuggestedInvestigations,
    setInvestigationsDisclaimer,
    reset,
  } = useIntakeStore();

  const [profileLoading, setProfileLoading] = useState(true);
  const [started, setStarted]               = useState(false);
  const [inputMode, setInputMode]           = useState<InputMode>("text");
  const [textInput, setTextInput]           = useState("");
  const [aiLoading, setAiLoading]           = useState(false);
  const [emergency, setEmergency]           = useState<string | null>(null);
  const [apiError, setApiError]             = useState<string | null>(null);
  const [isComplete, setIsComplete]         = useState(false);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Voice lang derived from store language
  const currentVoiceLang = voiceLang(language);
  const voiceInput  = useVoiceInput(currentVoiceLang);
  const voiceSpeech = useVoiceSpeech(currentVoiceLang);

  // Voice available only on High tier
  const voiceFullySupported = voiceInput.supported && voiceSpeech.supported;
  const voiceAvailable      = voiceFullySupported && tier === "high";

  // ── Load patient profile ──────────────────────────────────────────────────
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
          age:               (pp as { age?: number | null } | null)?.age               ?? null,
          gender:            (pp as { gender?: string | null } | null)?.gender          ?? null,
          allergies:         (pp as { allergies?: string | null } | null)?.allergies    ?? null,
          chronicConditions: (pp as { chronic_conditions?: string | null } | null)?.chronic_conditions ?? null,
        };
        setPatientContext(ctx);
      }
      setProfileLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, aiLoading]);

  // ── Speak AI messages in voice mode ──────────────────────────────────────
  useEffect(() => {
    if (inputMode !== "voice" || conversation.length === 0) return;
    const last = conversation[conversation.length - 1];
    // Don't speak system messages (fallback notices)
    if (last.role === "assistant" && !aiLoading) {
      voiceSpeech.speak(last.content);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, aiLoading, inputMode]);

  // ── Emergency: stop mic + speak warning ──────────────────────────────────
  useEffect(() => {
    if (emergency) {
      voiceInput.stopListening();
      voiceSpeech.stop();
      voiceSpeech.speak(emergency);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emergency]);

  // ── Mode switch ───────────────────────────────────────────────────────────
  const handleModeSwitch = (m: InputMode) => {
    voiceInput.stopListening();
    voiceSpeech.stop();
    voiceInput.resetTranscript();
    setInputMode(m);
  };

  // ── Tier switch (only before starting) ────────────────────────────────────
  const handleTierSelect = (t: IntakeTier) => {
    setTier(t);
    // Force text mode when switching to Low (voice not available on Low)
    if (t === "low") {
      setInputMode("text");
      setLanguage("en");
    }
  };

  // ── Core sendMessage ──────────────────────────────────────────────────────
  const sendMessage = useCallback(async (userText: string) => {
    if (!userText.trim() || aiLoading || emergency) return;

    voiceInput.stopListening();
    voiceSpeech.stop();

    const userMsg: ChatMessage = { role: "user", content: userText.trim() };
    addMessage(userMsg);
    setTextInput("");
    voiceInput.resetTranscript();
    setAiLoading(true);
    setApiError(null);

    try {
      const endpoint = apiEndpoint(tier);
      const res = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Filter out system messages (fallback notices) — API only accepts user/assistant roles
          conversationHistory:   [...conversation, userMsg].filter((m) => m.role === "user" || m.role === "assistant"),
          patientContext:        patientContext ?? { name: "Patient", age: null, gender: null, allergies: null, chronicConditions: null },
          currentStructuredData: data,
          language:              tier === "high" ? language : "en",
        }),
      });

      const json = await res.json() as Record<string, unknown>;

      if (!res.ok) {
        setApiError(json?.error ? extractErrorMessage(json.error) : "AI service unavailable. Please try again.");
        setAiLoading(false);
        return;
      }

      // Emergency
      if (json.emergency === true) {
        setEmergency(json.message as string);
        setAiLoading(false);
        return;
      }

      // Fallback notice — add as inline system message
      if (json.fallbackOccurred === true && json.fallbackNotice) {
        setFallbackOccurred(true);
        addMessage({ role: "system", content: json.fallbackNotice as string });
      }

      if (json.updatedData) setData({ ...data, ...(json.updatedData as Record<string, string>) });

      const reply = (json.nextQuestion as string | null)
        ?? (json.isComplete ? "Thanks — I have everything I need. Please review your information." : null);

      if (reply) addMessage({ role: "assistant", content: reply });

      if (json.isComplete) {
        if (json.recommendedDepartment) {
          setRecommendedDepartment(json.recommendedDepartment as Parameters<typeof setRecommendedDepartment>[0]);
          setRecommendedDepartmentReason((json.recommendedDepartmentReason as string) ?? "");
          setAlternateDepartment((json.alternateDepartment as Parameters<typeof setAlternateDepartment>[0]) ?? null);
        }
        setSuggestedInvestigations((json.suggestedInvestigations as string[]) ?? []);
        setInvestigationsDisclaimer(
          (json.investigationsDisclaimer as string) ??
          "These are commonly associated tests, not a prescription — your doctor will decide what's actually needed based on examination."
        );
        setIsComplete(true);
      }
    } catch {
      setApiError("Network error — please check your connection and try again.");
    }

    setAiLoading(false);
    setTimeout(() => textInputRef.current?.focus(), 50);
  }, [
    aiLoading, emergency, tier, language, conversation, patientContext, data,
    addMessage, setData, setFallbackOccurred, setRecommendedDepartment,
    setRecommendedDepartmentReason, setAlternateDepartment,
    setSuggestedInvestigations, setInvestigationsDisclaimer,
    voiceInput, voiceSpeech,
  ]);

  // ── Kick off first AI question ────────────────────────────────────────────
  const handleStart = async () => {
    if (!consented) return;
    reset();
    setConsented(true);
    if (patientContext) setPatientContext(patientContext);
    setStarted(true);
    setIsComplete(false);
    setEmergency(null);
    setApiError(null);

    setAiLoading(true);
    try {
      const endpoint = apiEndpoint(tier);
      const res = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationHistory:   [{ role: "user", content: "Hello, I'd like to start my intake." }],
          patientContext:        patientContext ?? { name: "Patient", age: null, gender: null, allergies: null, chronicConditions: null },
          currentStructuredData: {},
          language:              tier === "high" ? language : "en",
        }),
      });
      const json = await res.json() as Record<string, unknown>;
      if (!res.ok) { setApiError(json?.error ? extractErrorMessage(json.error) : "AI service unavailable."); setAiLoading(false); return; }
      if (json.fallbackOccurred && json.fallbackNotice) {
        setFallbackOccurred(true);
        addMessage({ role: "system", content: json.fallbackNotice as string });
      }
      if (json.nextQuestion) {
        addMessage({ role: "user",      content: "Hello, I'd like to start my intake." });
        addMessage({ role: "assistant", content: json.nextQuestion as string });
      }
    } catch {
      setApiError("Could not connect to AI. Please try again.");
    }
    setAiLoading(false);
  };

  const handleTextKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(textInput); }
  };

  const collected = countCollectedFields(data);

  // ── Pre-start screen ──────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <GlassCard className="p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bot className="h-6 w-6" aria-hidden="true" />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => router.push("/patient/ai-agent/history")}
              >
                <History className="h-4 w-4" />
                Past intakes
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            <h1 className="mt-4 text-2xl font-semibold tracking-tight">AI Intake Agent</h1>
            <p className="mt-2 text-muted-foreground">
              Answer a few questions about your symptoms. I&apos;ll prepare a
              doctor-ready summary — no repeated basics.
            </p>

            {/* ── Tier picker ─────────────────────────────────────────── */}
            <div className="mt-6">
              <p className="mb-3 text-sm font-medium">Choose intake mode:</p>
              <TierPicker selected={tier} onSelect={handleTierSelect} />
            </div>

            {/* ── Language toggle (High only) ──────────────────────────── */}
            {tier === "high" && (
              <div className="mt-4">
                <LanguageToggle language={language} onChange={setLanguage} />
              </div>
            )}

            {/* ── What we already know ─────────────────────────────────── */}
            {!profileLoading && patientContext && (
              <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
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

            {/* ── Consent ─────────────────────────────────────────────── */}
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
      {/* Progress + controls */}
      <GlassCard className="p-4 space-y-3">
        <ProgressBar collected={collected} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <ModeToggle
              mode={inputMode}
              onToggle={handleModeSwitch}
              voiceSupported={voiceFullySupported}
              tierIsHigh={tier === "high"}
            />
            {tier === "high" && inputMode === "voice" && (
              <LanguageToggle language={language} onChange={setLanguage} />
            )}
          </div>
          {/* Tier badge */}
          <span className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${
            tier === "high"
              ? "border-primary/20 bg-primary/10 text-primary"
              : "border-muted text-muted-foreground"
          }`}>
            {tier === "high" ? <Sparkles className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
            {tier === "high" ? "Advanced" : "Standard"}
            {fallbackOccurred && (
              <span className="ml-1 text-amber-600">(using Standard)</span>
            )}
          </span>
        </div>
        {voiceInput.error && (
          <p className="text-xs text-destructive">{voiceInput.error}</p>
        )}
      </GlassCard>

      {/* Emergency banner */}
      {emergency && <EmergencyBanner message={emergency} />}

      {/* Chat window */}
      <GlassCard className="flex flex-col overflow-hidden p-0 min-h-[300px] h-[58dvh] max-h-[520px]">
        <div className="flex-1 overflow-y-auto space-y-3 p-4">
          {conversation.map((msg, i) => {
            // System messages (fallback notice) — inline amber banner
            if (msg.role === "system") {
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-center"
                >
                  <div className="max-w-[92%] rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                    ⚠️ {msg.content}
                  </div>
                </motion.div>
              );
            }

            return (
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
                      {tier === "high" ? <Sparkles className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                      {tier === "high" ? "Kimi K3" : "AI Agent"}
                      {fallbackOccurred && <span className="text-amber-500">(Standard)</span>}
                      {voiceSpeech.speaking && inputMode === "voice" && (
                        <Volume2 className="h-3 w-3 animate-pulse text-primary ml-1" />
                      )}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </motion.div>
            );
          })}

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

        {/* Input area */}
        {!emergency && !isComplete && (
          <>
            {inputMode === "text" ? (
              <div className="border-t border-white/40 p-3">
                {apiError && (
                  <p className="mb-2 text-xs text-destructive" role="alert">{apiError}</p>
                )}
                <div className="flex items-center gap-2">
                  <input
                    ref={textInputRef}
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={handleTextKey}
                    placeholder={language === "hi" ? "अपना जवाब टाइप करें…" : "Type your answer…"}
                    aria-label={language === "hi" ? "आपका जवाब" : "Your answer"}
                    disabled={aiLoading}
                    className="flex-1 rounded-xl border border-input bg-white/60 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 placeholder:text-muted-foreground disabled:opacity-50"
                  />
                  <Button
                    size="icon"
                    onClick={() => sendMessage(textInput)}
                    disabled={!textInput.trim() || aiLoading}
                    aria-label={language === "hi" ? "भेजें" : "Send"}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <VoicePanel
                listening={voiceInput.listening}
                speaking={voiceSpeech.speaking}
                transcript={voiceInput.transcript}
                interim={voiceInput.interim}
                inputError={voiceInput.error}
                onStartListening={voiceInput.startListening}
                onStopListening={voiceInput.stopListening}
                onStopSpeaking={voiceSpeech.stop}
                onSubmit={sendMessage}
                onTranscriptChange={voiceInput.setTranscript}
                disabled={aiLoading || !!emergency}
                language={language}
              />
            )}
            {inputMode === "voice" && apiError && (
              <p className="px-4 pb-2 text-xs text-destructive" role="alert">{apiError}</p>
            )}
          </>
        )}
      </GlassCard>

      {/* Intake complete */}
      {isComplete && !emergency && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <GlassCard className="flex flex-col items-center gap-4 p-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-teal-600" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                {language === "hi" ? "इनटेक पूरा हुआ" : "Intake complete"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {language === "hi"
                  ? "अपनी जानकारी की समीक्षा करें और रिपोर्ट तैयार करें।"
                  : "Review your information and generate your doctor-ready report."}
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => { voiceSpeech.stop(); router.push("/patient/ai-agent/review"); }}
              className="w-full sm:w-auto"
            >
              {language === "hi" ? "समीक्षा करें और रिपोर्ट बनाएं" : "Review & generate report"}
            </Button>
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
}
