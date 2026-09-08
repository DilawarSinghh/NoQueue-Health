"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types (Web Speech API is not in every TS lib set) ────────────────────────
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results:     SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error:   string;
  message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous:         boolean;
  interimResults:     boolean;
  lang:               string;
  maxAlternatives:    number;
  start():            void;
  stop():             void;
  abort():            void;
  onresult:           ((e: SpeechRecognitionEvent) => void) | null;
  onerror:            ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend:              (() => void) | null;
  onstart:            (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition:       new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

// ─── Feature detection (safe on SSR) ─────────────────────────────────────────
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// ─── Supported recognition language codes ────────────────────────────────────
export type VoiceLang = "en-IN" | "hi-IN" | "en-US" | "en-GB";

// ─── Hook ─────────────────────────────────────────────────────────────────────
export interface UseVoiceInputReturn {
  supported:    boolean;
  listening:    boolean;
  transcript:   string;      // final text so far
  interim:      string;      // live partial word
  error:        string | null;
  startListening: () => void;
  stopListening:  () => void;
  resetTranscript: () => void;
  setTranscript:   (t: string) => void; // allow manual edits
}

/**
 * @param lang  BCP-47 language tag for speech recognition.
 *              Reactive — changing this prop mid-session stops any active
 *              recognition and the next startListening() call uses the new lang.
 *              Default: "en-IN"
 */
export function useVoiceInput(lang: VoiceLang = "en-IN"): UseVoiceInputReturn {
  const supported = isSpeechRecognitionSupported();

  const [listening,  setListening]  = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim,    setInterim]    = useState("");
  const [error,      setError]      = useState<string | null>(null);

  const recogRef = useRef<SpeechRecognitionInstance | null>(null);
  // Keep lang in a ref so startListening() always uses the latest value
  // even if it was constructed before the prop changed.
  const langRef  = useRef<VoiceLang>(lang);

  useEffect(() => {
    langRef.current = lang;
    // If recognition is active and the language changed, stop and let the
    // caller restart — the new lang will be picked up on the next start.
    if (recogRef.current && listening) {
      recogRef.current.stop();
    }
  }, [lang, listening]);

  // Build a fresh instance each time we start (avoids stale closure issues)
  const startListening = useCallback(() => {
    if (!supported) return;
    setError(null);

    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const r    = new Ctor();
    r.lang            = langRef.current;  // always the latest lang
    r.continuous      = true;
    r.interimResults  = true;
    r.maxAlternatives = 1;

    r.onstart = () => setListening(true);

    r.onresult = (e: SpeechRecognitionEvent) => {
      let finalChunk   = "";
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalChunk += text;
        } else {
          interimChunk += text;
        }
      }
      if (finalChunk)   setTranscript((prev) => (prev + " " + finalChunk).trimStart());
      if (interimChunk) setInterim(interimChunk);
      else              setInterim("");
    };

    r.onerror = (e: SpeechRecognitionErrorEvent) => {
      // "no-speech" is common and not a real error — ignore it
      if (e.error !== "no-speech") {
        setError(`Microphone error: ${e.error}`);
      }
    };

    r.onend = () => {
      setListening(false);
      setInterim("");
    };

    recogRef.current = r;
    r.start();
  }, [supported]);

  const stopListening = useCallback(() => {
    recogRef.current?.stop();
    recogRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterim("");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { recogRef.current?.abort(); };
  }, []);

  return {
    supported,
    listening,
    transcript,
    interim,
    error,
    startListening,
    stopListening,
    resetTranscript,
    setTranscript,
  };
}
