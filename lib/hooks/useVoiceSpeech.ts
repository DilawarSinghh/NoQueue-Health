"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceLang } from "./useVoiceInput";

// ─── Feature detection ────────────────────────────────────────────────────────
export function isSpeechSynthesisSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "speechSynthesis" in window;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export interface UseVoiceSpeechReturn {
  supported: boolean;
  speaking:  boolean;
  speak:     (text: string) => void;
  stop:      () => void;
}

/**
 * @param lang  BCP-47 language tag for speech synthesis.
 *              Reactive — changing this prop causes the next speak() call to
 *              use the new language/voice. Any in-progress speech is cancelled
 *              immediately when lang changes.
 *              Default: "en-IN"
 */
export function useVoiceSpeech(lang: VoiceLang = "en-IN"): UseVoiceSpeechReturn {
  const supported  = isSpeechSynthesisSupported();
  const [speaking, setSpeaking] = useState(false);
  const utterRef   = useRef<SpeechSynthesisUtterance | null>(null);
  const langRef    = useRef<VoiceLang>(lang);

  // Keep langRef in sync; cancel any active speech if language switches
  useEffect(() => {
    if (langRef.current !== lang) {
      langRef.current = lang;
      if (supported && speaking) {
        window.speechSynthesis.cancel();
        setSpeaking(false);
      }
    }
  }, [lang, speaking, supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback((text: string) => {
    if (!supported || !text.trim()) return;

    // Cancel any ongoing speech first
    window.speechSynthesis.cancel();

    const utter       = new SpeechSynthesisUtterance(text);
    utter.lang        = langRef.current;  // always the latest lang
    utter.rate        = 0.95;
    utter.pitch       = 1;
    utter.volume      = 1;

    utter.onstart = () => setSpeaking(true);
    utter.onend   = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);

    utterRef.current = utter;
    window.speechSynthesis.speak(utter);
  }, [supported]);

  // Cleanup on unmount — cancel any pending speech
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  return { supported, speaking, speak, stop };
}
