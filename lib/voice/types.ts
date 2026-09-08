/**
 * lib/voice/types.ts
 *
 * Provider-agnostic voice layer types.
 * The voice layer is INDEPENDENT from the AI reasoning layer — providers
 * here only do Speech-to-Text and Text-to-Speech. Sarvam is the primary
 * implementation; the browser Web Speech API is the fallback (client-side).
 */

// ─── Speech-to-Text ───────────────────────────────────────────────────────────

/** Language selection for transcription. "auto" lets the provider detect. */
export type STTLanguage = "auto" | "en-IN" | "hi-IN";

export interface AudioInput {
  /** Raw audio bytes. */
  data: ArrayBuffer | Uint8Array;
  /** MIME type as produced by the browser recorder, e.g. "audio/webm". */
  mimeType: string;
  /** Original filename hint (extension matters for some providers). */
  filename?: string;
}

export interface STTOptions {
  language: STTLanguage;
}

export interface STTResult {
  transcript: string;
  /** BCP-47 code of the detected/spoken language, if the provider reports it. */
  languageCode: string | null;
}

export interface SpeechToTextProvider {
  readonly id: string;
  transcribe(input: AudioInput, options: STTOptions): Promise<STTResult>;
}

// ─── Text-to-Speech ───────────────────────────────────────────────────────────

export type TTSLanguage = "en-IN" | "hi-IN";

export interface TTSOptions {
  language: TTSLanguage;
}

export interface TTSResult {
  /** Synthesized audio bytes (WAV by default for Sarvam Bulbul). */
  audio: ArrayBuffer;
  /** MIME type of `audio`. */
  mimeType: string;
}

export interface TextToSpeechProvider {
  readonly id: string;
  synthesize(text: string, options: TTSOptions): Promise<TTSResult>;
}

// ─── Safe error vocabulary (returned to the client — never raw provider text) ──

export type VoiceErrorCode =
  | "VOICE_NOT_CONFIGURED"
  | "VOICE_INVALID_REQUEST"
  | "VOICE_INVALID_AUDIO"
  | "VOICE_AUTH_FAILED"
  | "VOICE_PAYLOAD_TOO_LARGE"
  | "VOICE_RATE_LIMITED"
  | "VOICE_TIMEOUT"
  | "VOICE_NETWORK_ERROR"
  | "VOICE_TRANSCRIPTION_FAILED"
  | "VOICE_SYNTHESIS_FAILED"
  | "VOICE_UNAVAILABLE";

/** Map provider HTTP status → safe, client-presentable error code. */
export function mapVoiceHttpError(status: number | undefined): VoiceErrorCode {
  if (status === 401 || status === 403) return "VOICE_AUTH_FAILED";
  if (status === 400) return "VOICE_INVALID_REQUEST";
  if (status === 422) return "VOICE_INVALID_AUDIO";
  if (status === 413) return "VOICE_PAYLOAD_TOO_LARGE";
  if (status === 429) return "VOICE_RATE_LIMITED";
  if (status === 408) return "VOICE_TIMEOUT";
  if (status != null && status >= 500) return "VOICE_UNAVAILABLE";
  return "VOICE_TRANSCRIPTION_FAILED";
}
