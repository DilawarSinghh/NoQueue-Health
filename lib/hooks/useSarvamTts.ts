"use client";

/**
 * lib/hooks/useSarvamTts.ts
 *
 * Playback hook for server-synthesized Sarvam Bulbul audio.
 * Calls POST /api/text-to-speech, decodes the base64 WAV, and plays it
 * through a SINGLE Audio element — a new speak() always stops the previous
 * audio first, so AI voices never overlap. Falls back gracefully with an
 * error state the caller can use to switch to browser speechSynthesis.
 *
 * States: idle → generating → playing → finished | error
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type TtsState = "idle" | "generating" | "playing" | "finished" | "error";

export interface UseSarvamTtsReturn {
  state:        TtsState;
  error:        string | null;
  /** Synthesize + play. Resolves true if playback started successfully. */
  speak:        (text: string, languageCode: "en-IN" | "hi-IN") => Promise<boolean>;
  stop:         () => void;
}

export function useSarvamTts(): UseSarvamTtsReturn {
  const [state, setState] = useState<TtsState>("idle");
  const [error, setError] = useState<string | null>(null);

  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const urlRef     = useRef<string | null>(null);
  const seqRef     = useRef(0); // guards against stale async completions

  // Guaranteed single-flight stop
  const stop = useCallback(() => {
    seqRef.current++;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setState((s) => (s === "generating" || s === "playing" ? "idle" : s));
  }, []);

  const speak = useCallback(
    async (text: string, languageCode: "en-IN" | "hi-IN"): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed) return false;

      // Stop whatever is playing/generating before starting a new request
      stop();

      const mySeq = ++seqRef.current;
      setState("generating");
      setError(null);

      try {
        const res = await fetch("/api/text-to-speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed.slice(0, 2500), languageCode }),
        });
        if (mySeq !== seqRef.current) return false; // superseded by a newer speak()

        const json = (await res.json()) as { success?: boolean; audioBase64?: string; mimeType?: string };

        if (!res.ok || !json.success || !json.audioBase64) {
          setState("error");
          setError("VOICE_SYNTHESIS_FAILED");
          return false;
        }

        const bytes = Uint8Array.from(atob(json.audioBase64), (c) => c.charCodeAt(0));
        const blob  = new Blob([bytes as unknown as BlobPart], { type: json.mimeType || "audio/wav" });
        const url   = URL.createObjectURL(blob);
        urlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        let resolveFinished: (ok: boolean) => void = () => {};
        const finished = new Promise<boolean>((resolve) => { resolveFinished = resolve; });
        audio.onended = () => {
          if (mySeq === seqRef.current) {
            setState("finished");
            resolveFinished(true);
          } else {
            resolveFinished(false);
          }
        };
        audio.onerror = () => {
          if (mySeq === seqRef.current) {
            setState("error");
            setError("VOICE_PLAYBACK_FAILED");
          }
          resolveFinished(false);
        };

        // Explicit race-guard: if superseded while awaiting play()
        const playPromise = audio.play();
        if (playPromise) {
          try {
            await playPromise;
          } catch {
            // Autoplay interruption (e.g. user gesture policy) — treat as stop
            if (mySeq === seqRef.current) {
              setState("idle");
              resolveFinished(false);
            }
            return false;
          }
        }
        if (mySeq !== seqRef.current) return false;
        setState("playing");
        return finished;
      } catch {
        if (mySeq === seqRef.current) {
          setState("error");
          setError("VOICE_UNAVAILABLE");
        }
        return false;
      }
    },
    [stop]
  );

  // Cleanup on unmount
  useEffect(() => stop, [stop]);

  return { state, error, speak, stop };
}
