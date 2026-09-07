"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useIntakeStore, type ChatMessage } from "@/lib/store";
import {
  type PatientContext,
  countCollectedFields,
  INTAKE_FIELD_ORDER,
} from "@/lib/schema";
import { useVoiceInput } from "@/lib/hooks/useVoiceInput";
import { useVoiceSpeech } from "@/lib/hooks/useVoiceSpeech";

type InputMode = "text" | "voice";

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

// ─── Mode toggle ──────────────────────────────────────────────────────────────
function ModeToggle({
  mode,
  onToggle,
  voiceSupported,
}: {
  mode: InputMode;
  onToggle: (m: InputMode) => void;
  voiceSupported: boolean;
}) {
  return (
    <div className="flex w-fit gap-1 rounded-xl border border-white/40 bg-white/40 p-1 backdrop-blur-sm">
      {(["text", "voice"] as InputMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onToggle(m)}
          disabled={m === "voice" && !voiceSupported}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            mode === m
              ? "bg-white shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title={m === "voice" && !voiceSupported ? "Voice not supported in this browser" : undefined}
        >
          {m === "text" ? <Send className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          {m === "text" ? "Text" : "Voice"}
        </button>
      ))}
    </div>
  );
}

// ─── Voice controls ───────────────────────────────────────────────────────────
function VoicePanel({
  listening,
  speaking,
  transcript,
  interim,
  inputError,
  onStartListening,
  onStopListening,
  onStopSpeaking,
  onSubmit,
  onTranscriptChange,
  disabled,
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
}) {
  return (
    <div className="border-t border-white/40 p-4 space-y-3">
      {/* Live transcript — editable so user can fix mis-recognitions */}
      <div className="grid gap-1.5">
        <Label htmlFor="voice-transcript" className="text-xs text-muted-foreground">
          Your answer {listening && <span className="text-red-500 animate-pulse">● Recording…</span>}
        </Label>
        <div className="relative">
          <textarea
            id="voice-transcript"
            value={transcript + (interim ? ` ${interim}` : "")}
            onChange={(e) => {
              // strip the interim part — user edits only the final transcript
              onTranscriptChange(e.target.value);
            }}
            rows={2}
            placeholder={listening ? "Listening… speak now" : "Press the mic to start speaking"}
            className="w-full resize-none rounded-xl border border-input bg-white/60 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 placeholder:text-muted-foreground"
            aria-label="Voice transcript — editable"
          />
          {interim && (
            <span className="absolute bottom-2 right-3 text-xs text-muted-foreground/60 italic">
              {interim}
            </span>
          )}
        </div>
        {inputError && (
          <p className="text-xs text-destructive" role="alert">{inputError}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Mic toggle */}
        <button
          onClick={listening ? onStopListening : onStartListening}
          disabled={disabled}
          aria-label={listening ? "Stop recording" : "Start recording"}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-all disabled:opacity-50 ${
            listening
              ? "bg-red-500 text-white shadow-lg shadow-red-200 animate-pulse"
              : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
        >
          {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>

        {/* Stop AI speaking */}
        {speaking && (
          <button
            onClick={onStopSpeaking}
            aria-label="Stop AI speaking"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-600 hover:bg-amber-200"
          >
            <VolumeX className="h-4 w-4" />
          </button>
        )}
        {speaking && !listening && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Volume2 className="h-3.5 w-3.5 text-primary animate-pulse" /> AI is speaking…
          </span>
        )}

        {/* Submit transcript */}
        <Button
          className="ml-auto gap-2"
          onClick={() => {
            onStopListening();
            onSubmit(transcript.trim());
          }}
          disabled={!transcript.trim() || disabled}
        >
          <Send className="h-4 w-4" /> Submit
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AIAgentPage() {
  const router = useRouter();

  const {
    consented, setConsented,
    patientContext, setPatientContext,
    data, setData,
    conversation, addMessage,
    setRecommendedDepartment,
    setRecommendedDepartmentReason,
    setAlternateDepartment,
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

  const bottomRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Voice hooks
  const voiceInput  = useVoiceInput("en-IN");
  const voiceSpeech = useVoiceSpeech("en-IN");

  // If either API is not supported, force text mode and show notice
  const voiceFullySupported = voiceInput.supported && voiceSpeech.supported;

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, aiLoading]);

  // Speak AI messages in voice mode
  useEffect(() => {
    if (inputMode !== "voice" || conversation.length === 0) return;
    const last = conversation[conversation.length - 1];
    if (last.role === "assistant" && !aiLoading) {
      voiceSpeech.speak(last.content);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, aiLoading, inputMode]);

  // Emergency: stop mic + stop speaking immediately
  useEffect(() => {
    if (emergency) {
      voiceInput.stopListening();
      voiceSpeech.stop();
      if (emergency) voiceSpeech.speak(emergency);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emergency]);

  // Switch modes — stop anything in progress
  const handleModeSwitch = (m: InputMode) => {
    voiceInput.stopListening();
    voiceSpeech.stop();
    voiceInput.resetTranscript();
    setInputMode(m);
  };

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

  // Core: send a message through the AI intake API
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

      if (json.emergency === true) {
        setEmergency(json.message);
        setAiLoading(false);
        return;
      }

      if (json.updatedData) setData({ ...data, ...json.updatedData });

      const reply = json.nextQuestion
        ?? (json.isComplete ? "Thanks — I have everything I need. Please review your information." : null);

      if (reply) addMessage({ role: "assistant", content: reply });

      if (json.isComplete) {
        // Save department recommendation to store before navigating to review
        if (json.recommendedDepartment) {
          setRecommendedDepartment(json.recommendedDepartment);
          setRecommendedDepartmentReason(json.recommendedDepartmentReason ?? "");
          setAlternateDepartment(json.alternateDepartment ?? null);
        }
        setIsComplete(true);
      }

    } catch {
      setApiError("Network error — please check your connection and try again.");
    }

    setAiLoading(false);
    setTimeout(() => textInputRef.current?.focus(), 50);
  }, [aiLoading, emergency, conversation, patientContext, data, addMessage, setData, voiceInput, voiceSpeech]);

  // Kick off with the first AI question
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
      if (!res.ok) { setApiError(json?.error ?? "AI service unavailable. Please try again."); setAiLoading(false); return; }
      if (json.nextQuestion) {
        addMessage({ role: "user",      content: "Hello, I'd like to start my intake." });
        addMessage({ role: "assistant", content: json.nextQuestion });
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
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bot className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">AI Intake Agent</h1>
            <p className="mt-2 text-muted-foreground">
              Answer a few questions about your symptoms. I&apos;ll prepare a
              doctor-ready summary — no repeated basics.
            </p>

            {/* Mode selector */}
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-muted-foreground">Choose input mode:</p>
              <ModeToggle
                mode={inputMode}
                onToggle={setInputMode}
                voiceSupported={voiceFullySupported}
              />
              {!voiceFullySupported && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Voice mode is not supported in this browser — text mode will be used.
                </p>
              )}
            </div>

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
      {/* Progress + mode toggle */}
      <GlassCard className="p-4 space-y-3">
        <ProgressBar collected={collected} />
        <div className="flex items-center justify-between gap-3">
          <ModeToggle
            mode={inputMode}
            onToggle={handleModeSwitch}
            voiceSupported={voiceFullySupported}
          />
          {voiceInput.error && (
            <p className="text-xs text-destructive">{voiceInput.error}</p>
          )}
        </div>
      </GlassCard>

      {/* Emergency banner */}
      {emergency && <EmergencyBanner message={emergency} />}

      {/* Chat window */}
      <GlassCard className="flex flex-col overflow-hidden p-0 min-h-[300px] h-[58dvh] max-h-[520px]">
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
                    {voiceSpeech.speaking && inputMode === "voice" && (
                      <Volume2 className="h-3 w-3 animate-pulse text-primary ml-1" />
                    )}
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

        {/* Input area — text or voice */}
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
                    placeholder="Type your answer…"
                    aria-label="Your answer"
                    disabled={aiLoading}
                    className="flex-1 rounded-xl border border-input bg-white/60 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 placeholder:text-muted-foreground disabled:opacity-50"
                  />
                  <Button
                    size="icon"
                    onClick={() => sendMessage(textInput)}
                    disabled={!textInput.trim() || aiLoading}
                    aria-label="Send"
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
              />
            )}
            {inputMode === "voice" && apiError && (
              <p className="px-4 pb-2 text-xs text-destructive" role="alert">{apiError}</p>
            )}
          </>
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
              onClick={() => { voiceSpeech.stop(); router.push("/patient/ai-agent/review"); }}
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
