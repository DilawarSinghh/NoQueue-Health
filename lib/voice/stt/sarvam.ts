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
 * IMPORTANT: The /speech-to-text transcribe endpoint does NOT accept a
 * `language_code` form field — Saaras v3 auto-detects the spoken language
 * itself (English, Hindi, and Hinglish code-mixing). Sending an extra
 * `language_code` field causes HTTP 400 from Sarvam, so we deliberately do
 * NOT send it. The client's language "selection" is therefore informational;
 * actual language detection is automatic.
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

export const sarvamSTT: SpeechToTextProvider = {
  id: "sarvam",

  async transcribe(input: AudioInput, options: STTOptions): Promise<STTResult> {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      throw new VoiceProviderError("VOICE_NOT_CONFIGURED", "SARVAM_API_KEY is not set");
    }

    const form = new FormData();
    const bytes = input.data instanceof Uint8Array
      ? input.data
      : new Uint8Array(input.data);

    if (bytes.byteLength === 0) {
      throw new VoiceProviderError("VOICE_INVALID_REQUEST", "Empty audio payload");
    }

    form.append(
      "file",
      new Blob([bytes as unknown as BlobPart], { type: input.mimeType || "audio/webm" }),
      input.filename ?? "recording.webm"
    );
    form.append("model", process.env.SARVAM_STT_MODEL || DEFAULT_STT_MODEL);
    // "transcribe" preserves the patient's spoken language (Hindi/Hinglish/English).
    // NOTE: no language_code field — Sarvam rejects it on this endpoint (HTTP 400).
    form.append("mode", "transcribe");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${DEFAULT_BASE_URL}/speech-to-text`, {
        method: "POST",
        headers: { "api-subscription-key": apiKey },
        body: form,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new VoiceProviderError("VOICE_TIMEOUT", "Speech-to-text request timed out");
      }
      throw new VoiceProviderError(
        "VOICE_NETWORK_ERROR",
        `Speech-to-text network error: ${err instanceof Error ? err.message : "unknown"}`
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // Log only safe metadata — never audio or provider body with credentials.
      console.error(`[voice/stt/sarvam] HTTP ${res.status} after ${(await res.text()).slice(0, 200) || "no body"}`);
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
