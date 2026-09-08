/**
 * app/api/speech-to-text/route.ts
 *
 * Server-side proxy for Sarvam Speech-to-Text.
 * The Sarvam API key never leaves the server. The browser sends the raw
 * recorded audio as multipart/form-data; we validate, forward to Sarvam,
 * and return only a safe, minimal response.
 *
 * Request:  multipart/form-data { audio: Blob, language?: "auto"|"en-IN"|"hi-IN" }
 * Response: { success: true, transcript, languageCode } | { success: false, error }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sarvamSTT } from "@/lib/voice/stt/sarvam";
import { VoiceProviderError } from "@/lib/voice/stt/sarvam";
import type { STTLanguage } from "@/lib/voice/types";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // 8 MB — generous for ≤30s webm/opus
const ALLOWED_LANGUAGES: ReadonlySet<string> = new Set(["auto", "en-IN", "hi-IN"]);

export async function POST(request: Request): Promise<NextResponse> {
  // Auth — voice intake is a patient feature
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "VOICE_UNAVAILABLE" },
      { status: 401 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "VOICE_INVALID_REQUEST" },
      { status: 400 }
    );
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json(
      { success: false, error: "VOICE_INVALID_REQUEST" },
      { status: 400 }
    );
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { success: false, error: "VOICE_PAYLOAD_TOO_LARGE" },
      { status: 413 }
    );
  }

  const languageRaw = String(form.get("language") ?? "auto");
  const language: STTLanguage = ALLOWED_LANGUAGES.has(languageRaw)
    ? (languageRaw as STTLanguage)
    : "auto";

  try {
    const result = await sarvamSTT.transcribe(
      {
        data: await audio.arrayBuffer(),
        mimeType: audio.type || "audio/webm",
        filename: "recording.webm",
      },
      { language }
    );

    return NextResponse.json({
      success: true,
      transcript: result.transcript,
      languageCode: result.languageCode,
    });
  } catch (err: unknown) {
    if (err instanceof VoiceProviderError) {
      console.error(`[speech-to-text] ${err.code}: ${err.message}`);
      const status =
        err.code === "VOICE_NOT_CONFIGURED" ? 503 :
        err.code === "VOICE_INVALID_REQUEST" ? 400 :
        err.code === "VOICE_PAYLOAD_TOO_LARGE" ? 413 :
        err.code === "VOICE_RATE_LIMITED" ? 429 :
        err.code === "VOICE_TIMEOUT" ? 504 :
        502;
      return NextResponse.json({ success: false, error: err.code }, { status });
    }
    console.error("[speech-to-text] unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: "VOICE_TRANSCRIPTION_FAILED" },
      { status: 502 }
    );
  }
}
