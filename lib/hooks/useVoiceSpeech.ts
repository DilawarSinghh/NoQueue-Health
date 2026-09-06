"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

export function useVoiceSpeech(lang = "en-IN"): UseVoiceSpeechReturn {
  const supported  = isSpeechSynthesisSupported();
  const [speaking, setSpeaking] = useState(false);
  const utterRef   = useRef<SpeechSynthesisUtterance | null>(null);

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
    utter.lang        = lang;
    utter.rate        = 0.95;
    utter.pitch       = 1;
    utter.volume      = 1;

    utter.onstart = () => setSpeaking(true);
    utter.onend   = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);

    utterRef.current = utter;
    window.speechSynthesis.speak(utter);
  }, [lang, supported]);

  // Cleanup on unmount — cancel any pending speech
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  return { supported, speaking, speak, stop };
}
