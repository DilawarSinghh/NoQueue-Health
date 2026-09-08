/**
 * lib/voice/tts/sarvam.ts
 *
 * Sarvam AI Text-to-Speech provider (Bulbul v3).
 * SERVER-ONLY — uses SARVAM_API_KEY; never import from client code.
 *
 * Contract (verified against docs.sarvam.ai, 2026):
 *   POST https://api.sarvam.ai/text-to-speech
 *   Header: api-subscription-key: <key>
 *   JSON: { text, language_code, speaker, model: "bulbul:v3", speech_sample_rate? }
 *   ≤2500 chars per request.
 *   Response JSON: { request_id, audios: [<base64 WAV>] }
 */

import type {
  TextToSpeechProvider,
  TTSOptions,
  TTSResult,
} from "../types";
import { mapVoiceHttpError } from "../types";
import { VoiceProviderError } from "../stt/sarvam";

const DEFAULT_BASE_URL = "https://api.sarvam.ai";
const DEFAULT_TTS_MODEL = "bulbul:v3";
const DEFAULT_SPEAKER = "shubh";
const MAX_CHARS = 2500;
const REQUEST_TIMEOUT_MS = 30_000;

async function callSarvam(
  text: string,
  options: TTSOptions
): Promise<Response> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new VoiceProviderError("VOICE_NOT_CONFIGURED", "SARVAM_API_KEY is not set");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${DEFAULT_BASE_URL}/text-to-speech`, {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model: process.env.SARVAM_TTS_MODEL || DEFAULT_TTS_MODEL,
        speaker: process.env.SARVAM_TTS_SPEAKER || DEFAULT_SPEAKER,
        language_code: options.language,
        speech_sample_rate: 24000,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export const sarvamTTS: TextToSpeechProvider = {
  id: "sarvam",

  async synthesize(text: string, options: TTSOptions): Promise<TTSResult> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new VoiceProviderError("VOICE_INVALID_REQUEST", "Cannot synthesize empty text");
    }
    if (trimmed.length > MAX_CHARS) {
      throw new VoiceProviderError("VOICE_INVALID_REQUEST", `Text exceeds ${MAX_CHARS} character limit`);
    }

    let res: Response;
    try {
      res = await callSarvam(trimmed, options);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new VoiceProviderError("VOICE_TIMEOUT", "Text-to-speech request timed out");
      }
      throw new VoiceProviderError(
        "VOICE_UNAVAILABLE",
        `Text-to-speech network error: ${err instanceof Error ? err.message : "unknown"}`
      );
    }

    if (!res.ok) {
      console.error(`[voice/tts/sarvam] HTTP ${res.status}`);
      throw new VoiceProviderError(
        mapVoiceHttpError(res.status),
        `Text-to-speech failed with HTTP ${res.status}`
      );
    }

    let json: { audios?: unknown };
    try {
      json = (await res.json()) as typeof json;
    } catch {
      throw new VoiceProviderError("VOICE_SYNTHESIS_FAILED", "Malformed response from speech provider");
    }

    const audios = Array.isArray(json.audios) ? json.audios : [];
    const base64 = audios.find((a): a is string => typeof a === "string" && a.length > 0);
    if (!base64) {
      throw new VoiceProviderError("VOICE_SYNTHESIS_FAILED", "No audio returned");
    }

    const audio = Buffer.from(base64, "base64");
    return {
      // Sarvam Bulbul returns WAV by default
      audio: audio.buffer.slice(
        audio.byteOffset,
        audio.byteOffset + audio.byteLength
      ) as ArrayBuffer,
      mimeType: "audio/wav",
    };
  },
};
