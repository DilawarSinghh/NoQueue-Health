"use client";

/**
 * lib/hooks/useVoiceRecorder.ts
 *
 * Push-to-talk microphone recorder using MediaRecorder.
 * Records a short (≤30s) audio clip for server-side transcription
 * (Sarvam STT). This is intentionally NOT a continuous/duplex mic —
 * the mic is only active while the patient holds/taps record, which
 * prevents feedback loops with TTS playback and accidental capture.
 *
 * States: idle → recording → processing → (result via onStop callback) | error
 */

import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_RECORDING_MS = 30_000; // Sarvam STT REST limit

export interface UseVoiceRecorderReturn {
  supported: boolean;
  recording: boolean;
  processing: boolean;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  clearError: () => void;
}

/** Pick the best supported audio MIME type for this browser. */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export function isVoiceRecorderSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    pickMimeType() !== null
  );
}

export function useVoiceRecorder(
  onAudioReady: (blob: Blob) => void
): UseVoiceRecorderReturn {
  const supported = isVoiceRecorderSupported();

  const [recording, setRecording]   = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-current callback without re-creating recording closures
  const onReadyRef  = useRef(onAudioReady);
  useEffect(() => { onReadyRef.current = onAudioReady; }, [onAudioReady]);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (!supported) {
      setError("Recording is not supported in this browser. Please type your answer instead.");
      return;
    }
    setError(null);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : "";
      setError(
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Microphone permission was denied. Allow mic access, or type your answer instead."
          : "Microphone is unavailable. Please type your answer instead."
      );
      return;
    }

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("Recording failed to start. Please type your answer instead.");
      return;
    }

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      cleanup();
      // Guard against empty recordings (mic opened but nothing captured)
      if (blob.size < 1024) {
        setError("No speech captured — please try again, or type your answer.");
        return;
      }
      setProcessing(true);
      onReadyRef.current(blob);
      setProcessing(false);
    };

    recorderRef.current = recorder;
    streamRef.current   = stream;
    recorder.start();

    // Hard stop at the 30s Sarvam limit so recordings never fail silently
    timeoutRef.current = setTimeout(() => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    }, MAX_RECORDING_MS);

    setRecording(true);
  }, [supported, cleanup]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      cleanup();
    }
  }, [cleanup]);

  const clearError = useCallback(() => setError(null), []);

  // Release the mic on unmount
  useEffect(() => cleanup, [cleanup]);

  return { supported, recording, processing, error, startRecording, stopRecording, clearError };
}
