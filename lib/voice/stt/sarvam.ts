/**
 * lib/voice/stt/sarvam.ts
 *
 * Sarvam AI Speech-to-Text provider (Saaras models).
 * SERVER-ONLY — uses SARVAM_API_KEY; never import from client code.
 *
 * Contract (verified against docs.sarvam.ai, 2026):
 *   POST https://api.sarvam.ai/speech-to-text
 *   Header: api-subscription-key: <key>
 *   multipart/form-data: file (≤30s audio), model (saaras:v3), mode (transcribe)
 *   Response JSON: { request_id, transcript, language_code }
 *
 * Language: Saaras v3 auto-detects the spoken language (incl. Hinglish
 * code-mixing), so we run mode="transcribe" which preserves the patient's
 * spoken language — no forced translation to English.
 */

import type {
  AudioInput,
  SpeechToTextProvider,
  STTOptions,
  STTResult,
} from "../types";
import { mapVoiceHttpError } from "../types";

const DEFAULT_BASE_URL = "https://api.sarvam.ai";
const DEFAULT_STT_MODEL = "saaras:v3";
const REQUEST_TIMEOUT_MS = 30_000;

/** Server-side error carrying a safe client-facing code. */
export class VoiceProviderError extends Error {
  readonly code: string;
  constructor(code: string, detail: string) {
    super(detail);
    this.code = code;
    this.name = "VoiceProviderError";
  }
}

async function callSarvam(
  input: AudioInput,
  options: STTOptions,
  includeLanguageCode: boolean
): Promise<Response> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new VoiceProviderError("VOICE_NOT_CONFIGURED", "SARVAM_API_KEY is not set");
  }

  const form = new FormData();
  const bytes = input.data instanceof Uint8Array
    ? input.data
    : new Uint8Array(input.data);

  form.append(
    "file",
    new Blob([bytes as unknown as BlobPart], { type: input.mimeType || "audio/webm" }),
    input.filename ?? "recording.webm"
  );
  form.append("model", process.env.SARVAM_STT_MODEL || DEFAULT_STT_MODEL);
  // "transcribe" preserves the patient's spoken language (Hindi/Hinglish/English).
  form.append("mode", "transcribe");
  if (includeLanguageCode && options.language !== "auto") {
    form.append("language_code", options.language);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${DEFAULT_BASE_URL}/speech-to-text`, {
      method: "POST",
      headers: { "api-subscription-key": apiKey },
      body: form,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export const sarvamSTT: SpeechToTextProvider = {
  id: "sarvam",

  async transcribe(input: AudioInput, options: STTOptions): Promise<STTResult> {
    let res: Response;
    try {
      // Explicit language selection: send language_code; if this Sarvam model
      // doesn't accept the field (400/422), retry once without it — auto-
      // detection covers the case anyway.
      res = await callSarvam(input, options, options.language !== "auto");
      if (res.status === 400 || res.status === 422) {
        res = await callSarvam(input, options, false);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new VoiceProviderError("VOICE_TIMEOUT", "Speech-to-text request timed out");
      }
      throw new VoiceProviderError(
        "VOICE_UNAVAILABLE",
        `Speech-to-text network error: ${err instanceof Error ? err.message : "unknown"}`
      );
    }

    if (!res.ok) {
      // Log only status server-side — never the audio or provider body with
      // credentials. The body may echo request metadata; keep it out of logs.
      console.error(`[voice/stt/sarvam] HTTP ${res.status}`);
      throw new VoiceProviderError(
        mapVoiceHttpError(res.status),
        `Speech-to-text failed with HTTP ${res.status}`
      );
    }

    let json: { transcript?: unknown; language_code?: unknown };
    try {
      json = (await res.json()) as typeof json;
    } catch {
      throw new VoiceProviderError("VOICE_TRANSCRIPTION_FAILED", "Malformed response from speech provider");
    }

    const transcript = typeof json.transcript === "string" ? json.transcript.trim() : "";
    if (!transcript) {
      throw new VoiceProviderError("VOICE_TRANSCRIPTION_FAILED", "Empty transcript returned");
    }

    return {
      transcript,
      languageCode: typeof json.language_code === "string" ? json.language_code : null,
    };
  },
};
