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
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useIntakeStore, type ChatMessage, type IntakeModel, type IntakeLanguage } from "@/lib/store";
import { AI_PROVIDERS, type AIProviderId } from "@/lib/ai/types";
import {
  type PatientContext,
  countCollectedFields,
  INTAKE_FIELD_ORDER,
} from "@/lib/schema";
import { useVoiceInput, type VoiceLang } from "@/lib/hooks/useVoiceInput";
import { useVoiceSpeech } from "@/lib/hooks/useVoiceSpeech";
import { useVoiceRecorder, isVoiceRecorderSupported } from "@/lib/hooks/useVoiceRecorder";
import { useSarvamTts, type TtsState } from "@/lib/hooks/useSarvamTts";
import type { STTLanguage } from "@/lib/voice/types";

type InputMode = "text" | "voice";
type VoiceEngine = "sarvam" | "browser";
/** STT language selection — "auto" lets Sarvam detect (incl. Hinglish). */
type SttLangChoice = "auto" | "en" | "hi";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function voiceLang(language: IntakeLanguage): VoiceLang {
  return language === "hi" ? "hi-IN" : language === "auto" ? "en-IN" : "en-IN";
}

/**
 * Resolve the concrete TTS language for the Sarvam Bulbul call.
 * For 'en'/'hi' use the explicit choice. For 'auto', infer from the reply
 * text — Devanagari characters mean Hindi, otherwise English. This keeps the
 * TTS in the SAME language as the AI response even under auto-detect.
 */
function resolveTtsLanguage(language: IntakeLanguage, text: string): "en-IN" | "hi-IN" {
  if (language === "hi") return "hi-IN";
  if (language === "en") return "en-IN";
  // auto: detect Devanagari (U+0900–U+097F)
  return /[\u0900-\u097F]/.test(text) ? "hi-IN" : "en-IN";
}

function apiEndpoint(): string {
  return "/api/ai-intake/chat";
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

// ─── Model selector ───────────────────────────────────────────────────────────
function ModelSelector({
  selected,
  onSelect,
}: {
  selected: IntakeModel;
  onSelect: (m: IntakeModel) => void;
}) {
  const iconMap: Record<string, React.ElementType> = {
    Zap: Zap,
    Sparkles: Sparkles,
    Brain: Bot,
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {AI_PROVIDERS.map((provider) => {
        const active = selected === provider.id;
        const Icon = iconMap[provider.icon] || Zap;
        return (
          <button
            key={provider.id}
            type="button"
            onClick={() => onSelect(provider.id)}
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
                <p className={`font-semibold ${active ? "text-primary" : ""}`}>{provider.name}</p>
                <p className="text-xs text-muted-foreground">{provider.description}</p>
              </div>
              {active && (
                <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {provider.supportsVoice && (
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-700">
                  Voice
                </span>
              )}
              {provider.supportsHindi && (
                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">
                  Hindi
                </span>
              )}
            </div>
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
        {(["auto", "en", "hi"] as IntakeLanguage[]).map((l) => (
          <button
            key={l}
            onClick={() => onChange(l)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              language === l
                ? "bg-white shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l === "auto" ? "Auto" : l === "en" ? "English" : "हिंदी"}
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
  engine, onEngineChange,
  sttLanguage, onSttLanguageChange,
  browserListening, onStartBrowserListening, onStopBrowserListening,
  recording, processing, onStartRecording, onStopRecording,
  browserSpeaking, ttsState, onStopSpeaking, onPlayReply, onStopReply,
  transcript, interim, inputError,
  onSubmit, onTranscriptChange, disabled, language, lastReply, ttsBusy,
}: {
  engine:                VoiceEngine;
  onEngineChange:        (e: VoiceEngine) => void;
  sttLanguage:           SttLangChoice;
  onSttLanguageChange:   (l: SttLangChoice) => void;
  browserListening:      boolean;
  onStartBrowserListening: () => void;
  onStopBrowserListening:  () => void;
  recording:             boolean;
  processing:            boolean;
  onStartRecording:      () => void;
  onStopRecording:       () => void;
  browserSpeaking:       boolean;
  ttsState:              TtsState;
  onStopSpeaking:        () => void;
  onPlayReply:           () => void;
  onStopReply:           () => void;
  transcript:            string;
  interim:               string;
  inputError:            string | null;
  onSubmit:              (text: string) => void;
  onTranscriptChange:    (t: string) => void;
  disabled:              boolean;
  language:              IntakeLanguage;
  lastReply:             string | null;
  ttsBusy:               boolean;
}) {
  const hi          = language === "hi";
  const recordingNow = engine === "sarvam" ? recording : browserListening;
  const placeholder = hi
    ? (recordingNow ? "सुन रहा हूँ… अभी बोलें" : "बोलने के लिए माइक दबाएं")
    : (recordingNow ? "Listening… speak now" : "Press the mic to start speaking");

  const startVoice = () => {
    if (engine === "sarvam") {
      onStopReply();          // never record over TTS playback
      void onStartRecording();
    } else {
      onStopSpeaking();
      onStartBrowserListening();
    }
  };
  const stopVoice = () => {
    if (engine === "sarvam") onStopRecording();
    else onStopBrowserListening();
  };

  const micDisabled = disabled || ttsBusy; // no mic while AI voice is active

  return (
    <div className="border-t border-white/40 p-4 space-y-3">
      {/* Engine + STT language row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Voice:</span>
          <div className="flex gap-1 rounded-lg border border-white/40 bg-white/40 p-0.5">
            {(["sarvam", "browser"] as VoiceEngine[]).map((e) => (
              <button
                key={e}
                onClick={() => onEngineChange(e)}
                disabled={e === "sarvam" && !isVoiceRecorderSupported()}
                title={e === "browser" ? "Browser speech recognition (fallback)" : "AI voice (supports Hindi & Hinglish)"}
                className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                {e === "sarvam" ? "AI Voice" : "Browser"}
              </button>
            ))}
          </div>
        </div>

        {/* STT language — Sarvam only (browser engine uses conversation language) */}
        {engine === "sarvam" && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Spoken language:</span>
            <div className="flex gap-1 rounded-lg border border-white/40 bg-white/40 p-0.5">
              {(["auto", "en", "hi"] as SttLangChoice[]).map((l) => (
                <button
                  key={l}
                  onClick={() => onSttLanguageChange(l)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    sttLanguage === l
                      ? "bg-white shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {l === "auto" ? "Auto Detect" : l === "en" ? "English" : "हिन्दी"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Transcript */}
      <div className="grid gap-1.5">
        <Label htmlFor="voice-transcript" className="text-xs text-muted-foreground">
          {hi ? "आपका जवाब" : "Your answer"}{" "}
          {recordingNow && <span className="text-red-500 animate-pulse">● {hi ? "रिकॉर्डिंग…" : "Recording…"}</span>}
          {processing && <span className="text-primary animate-pulse"> {hi ? "ट्रांसक्राइब हो रहा है…" : "Transcribing…"}</span>}
        </Label>
        <div className="relative">
          <textarea
            id="voice-transcript"
            value={transcript + (interim ? ` ${interim}` : "")}
            onChange={(e) => onTranscriptChange(e.target.value)}
            rows={2}
            placeholder={placeholder}
            className="w-full resize-none rounded-xl border border-input bg-white/60 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 placeholder:text-muted-foreground"
            aria-label={hi ? "वॉयस ट्रांसक्रिप्ट" : "Voice transcript — editable"}
          />
          {interim && (
            <span className="absolute bottom-2 right-3 text-xs text-muted-foreground/60 italic">
              {interim}
            </span>
          )}
        </div>
        {inputError && <p className="text-xs text-destructive" role="alert">{inputError}</p>}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Mic — push-to-talk */}
        <button
          onClick={recordingNow ? stopVoice : startVoice}
          disabled={micDisabled}
          aria-label={recordingNow
            ? (hi ? "रिकॉर्डिंग बंद करें" : "Stop recording")
            : (hi ? "रिकॉर्डिंग शुरू करें" : "Start recording")}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-all disabled:opacity-50 ${
            recordingNow
              ? "bg-red-500 text-white shadow-lg shadow-red-200 animate-pulse"
              : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
        >
          {recordingNow ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>

        {processing && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            {hi ? "ट्रांसक्राइब हो रहा है…" : "Transcribing…"}
          </span>
        )}

        {/* TTS — Sarvam engine: generate/play current reply */}
        {engine === "sarvam" && (
          <>
            {ttsState === "generating" && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                {hi ? "आवाज़ तैयार हो रही है…" : "Generating voice…"}
              </span>
            )}
            {ttsState === "playing" && (
              <>
                <button
                  onClick={onStopReply}
                  aria-label={hi ? "AI को रोकें" : "Stop AI voice"}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-600 hover:bg-amber-200"
                >
                  <Square className="h-4 w-4" />
                </button>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Volume2 className="h-3.5 w-3.5 text-primary animate-pulse" />
                  {hi ? "AI बोल रहा है…" : "Playing…"}
                </span>
              </>
            )}
            {(ttsState === "idle" || ttsState === "finished" || ttsState === "error") && lastReply && (
              <button
                onClick={onPlayReply}
                disabled={disabled}
                aria-label={hi ? "जवाब चलाएं" : "Play response"}
                className="flex h-11 items-center gap-1.5 rounded-full bg-primary/10 px-4 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
              >
                <Volume2 className="h-4 w-4" />
                {hi ? "जवाब चलाएं" : "Play response"}
              </button>
            )}
          </>
        )}

        {/* TTS — browser fallback engine */}
        {engine === "browser" && (
          <>
            {browserSpeaking && (
              <button
                onClick={onStopSpeaking}
                aria-label={hi ? "AI को रोकें" : "Stop AI speaking"}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-600 hover:bg-amber-200"
              >
                <VolumeX className="h-4 w-4" />
              </button>
            )}
            {browserSpeaking && !recordingNow && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Volume2 className="h-3.5 w-3.5 text-primary animate-pulse" />
                {hi ? "AI बोल रहा है…" : "AI is speaking…"}
              </span>
            )}
          </>
        )}

        <Button
          className="ml-auto gap-2"
          onClick={() => { stopVoice(); onSubmit(transcript.trim()); }}
          disabled={!transcript.trim() || disabled}
        >
          <Send className="h-4 w-4" />
          {hi ? "भेजें" : "Submit"}
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AIAgentPage() {
  const router = useRouter();

  const {
    model, setModel,
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

  // ── Sarvam voice layer (server-side STT/TTS; browser Web Speech is fallback)
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngine>("sarvam");
  const [sttLangChoice, setSttLangChoice] = useState<SttLangChoice>("auto");

  // TTS: Sarvam Bulbul via /api/text-to-speech, browser synthesis as fallback
  const sarvamTts = useSarvamTts();

  const [sttError, setSttError] = useState<string | null>(null);

  const handleRecordedAudio = useCallback(async (blob: Blob) => {
    try {
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      form.append("language", sttLangChoice === "auto" ? "auto" : sttLangChoice === "hi" ? "hi-IN" : "en-IN");
      const res  = await fetch("/api/speech-to-text", { method: "POST", body: form });
      const json = (await res.json()) as { success?: boolean; transcript?: string; error?: string };
      if (!res.ok || !json.success || !json.transcript) {
        setSttError("Voice input is temporarily unavailable. You can type your answer instead.");
        return;
      }
      // Transcript lands in the same editable answer field the browser
      // engine uses — the downstream submit flow is identical.
      setSttError(null);
      voiceInput.setTranscript(json.transcript);
    } catch {
      setSttError("Voice input failed — please check your connection, or type your answer.");
    }
  }, [sttLangChoice, voiceInput]);
  const voiceRecorder = useVoiceRecorder(handleRecordedAudio);

  // Voice availability is engine-aware: Sarvam needs MediaRecorder support,
  // the browser engine needs Web Speech support. Both are High-tier only.
  const voiceFullySupported = voiceInput.supported && voiceSpeech.supported;
  const isHighTier          = AI_PROVIDERS.find((p) => p.id === model)?.supportsHindi ?? false;
  const engineSupported     = voiceEngine === "sarvam"
    ? voiceRecorder.supported
    : voiceFullySupported;
  const voiceAvailable      = engineSupported && isHighTier;

  // Unified TTS entry point: Sarvam primary, browser synthesis fallback.
  const speakReply = useCallback((text: string) => {
    if (!text.trim()) return;
    const ttsLang = resolveTtsLanguage(language, text);
    if (voiceEngine === "sarvam") {
      void sarvamTts.speak(text, ttsLang).then((ok) => {
        if (!ok) voiceSpeech.speak(text); // Sarvam failed — browser fallback
      });
    } else {
      voiceSpeech.speak(text);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEngine, language, sarvamTts, voiceSpeech]);

  // Stop every voice activity (used on mode switch / submit / emergency)
  const stopAllVoice = useCallback(() => {
    voiceInput.stopListening();
    voiceRecorder.stopRecording();
    voiceSpeech.stop();
    sarvamTts.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceInput, voiceRecorder, voiceSpeech, sarvamTts]);

  // TTS state derived from the active engine
  const ttsBusy    = voiceEngine === "sarvam"
    ? sarvamTts.state === "playing" || sarvamTts.state === "generating"
    : voiceSpeech.speaking;
  const ttsPlaying = voiceEngine === "sarvam"
    ? sarvamTts.state === "playing"
    : voiceSpeech.speaking;
  const lastAssistantReply = [...conversation].reverse().find((m) => m.role === "assistant")?.content ?? null;

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
      speakReply(last.content);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, aiLoading, inputMode]);

  // ── Emergency: stop mic + speak warning ──────────────────────────────────
  useEffect(() => {
    if (emergency) {
      stopAllVoice();
      speakReply(emergency);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emergency]);

  // ── Mode switch ───────────────────────────────────────────────────────────
  const handleModeSwitch = (m: InputMode) => {
    stopAllVoice();
    voiceInput.resetTranscript();
    setInputMode(m);
  };

  // ── Model switch (only before starting) ───────────────────────────────────
  const handleModelSelect = (m: IntakeModel) => {
    setModel(m);
    const provider = AI_PROVIDERS.find((p) => p.id === m);
    // Force text mode + English if the selected model doesn't support voice/Hindi
    if (provider && !provider.supportsVoice) {
      setInputMode("text");
    }
    if (provider && !provider.supportsHindi) {
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
    // Never record while the AI is about to reply/play audio
    voiceRecorder.stopRecording();
    voiceSpeech.stop();
    sarvamTts.stop();
    setAiLoading(true);
    setApiError(null);

    try {
      const endpoint = apiEndpoint();
      const res = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Filter out system messages (fallback notices) — API only accepts user/assistant roles
          conversationHistory:   [...conversation, userMsg].filter((m) => m.role === "user" || m.role === "assistant"),
          patientContext:        patientContext ?? { name: "Patient", age: null, gender: null, allergies: null, chronicConditions: null },
          currentStructuredData: data,
          language:              language,
          preferredProvider:     model,
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
    aiLoading, emergency, model, language, conversation, patientContext, data,
    addMessage, setData, setFallbackOccurred, setRecommendedDepartment,
    setRecommendedDepartmentReason, setAlternateDepartment,
    setSuggestedInvestigations, setInvestigationsDisclaimer,
    voiceInput, voiceSpeech, voiceRecorder, sarvamTts,
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
      const endpoint = apiEndpoint();
      const res = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationHistory:   [{ role: "user", content: "Hello, I'd like to start my intake." }],
          patientContext:        patientContext ?? { name: "Patient", age: null, gender: null, allergies: null, chronicConditions: null },
          currentStructuredData: {},
          language:              language,
          preferredProvider:     model,
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

            {/* ── Model selector ──────────────────────────────────────── */}
            <div className="mt-6">
              <p className="mb-3 text-sm font-medium">Choose AI model:</p>
              <ModelSelector selected={model} onSelect={handleModelSelect} />
            </div>

            {/* ── Language toggle (multilingual models only) ───────────── */}
            {AI_PROVIDERS.find((p) => p.id === model)?.supportsHindi && (
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
              voiceSupported={engineSupported}
              tierIsHigh={isHighTier}
            />
            {isHighTier && inputMode === "voice" && (
              <LanguageToggle language={language} onChange={setLanguage} />
            )}
          </div>
          {/* Model badge */}
          <span className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${
            isHighTier
              ? "border-primary/20 bg-primary/10 text-primary"
              : "border-muted text-muted-foreground"
          }`}>
            {isHighTier ? <Sparkles className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
            {AI_PROVIDERS.find((p) => p.id === model)?.name ?? "AI"}
            {fallbackOccurred && (
              <span className="ml-1 text-amber-600">(fallback active)</span>
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
                      {isHighTier ? <Sparkles className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                      {AI_PROVIDERS.find((p) => p.id === model)?.name ?? "AI Assistant"}
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
                engine={voiceEngine}
                onEngineChange={(e) => { stopAllVoice(); setVoiceEngine(e); }}
                sttLanguage={sttLangChoice}
                onSttLanguageChange={setSttLangChoice}
                browserListening={voiceInput.listening}
                onStartBrowserListening={voiceInput.startListening}
                onStopBrowserListening={voiceInput.stopListening}
                recording={voiceRecorder.recording}
                processing={voiceRecorder.processing}
                onStartRecording={voiceRecorder.startRecording}
                onStopRecording={voiceRecorder.stopRecording}
                browserSpeaking={voiceSpeech.speaking}
                ttsState={sarvamTts.state}
                onStopSpeaking={voiceSpeech.stop}
                onPlayReply={() => lastAssistantReply && speakReply(lastAssistantReply)}
                onStopReply={sarvamTts.stop}
                transcript={voiceInput.transcript}
                interim={voiceInput.interim}
                inputError={voiceRecorder.error ?? sttError ?? voiceInput.error}
                onSubmit={sendMessage}
                onTranscriptChange={voiceInput.setTranscript}
                disabled={aiLoading || !!emergency}
                language={language}
                lastReply={lastAssistantReply}
                ttsBusy={ttsBusy}
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
