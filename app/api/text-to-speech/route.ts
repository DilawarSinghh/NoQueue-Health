/**
 * app/api/text-to-speech/route.ts
 *
 * Server-side proxy for Sarvam Bulbul v3 Text-to-Speech.
 * The Sarvam API key never leaves the server. Audio is returned as base64
 * WAV in the JSON response — in-memory only, never persisted.
 *
 * Request:  JSON { text: string, languageCode: "en-IN"|"hi-IN" }
 * Response: { success: true, audioBase64, mimeType } | { success: false, error }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sarvamTTS } from "@/lib/voice/tts/sarvam";
import { VoiceProviderError } from "@/lib/voice/stt/sarvam";

const bodySchema = z.object({
  text: z.string().min(1).max(2500),
  languageCode: z.enum(["en-IN", "hi-IN"]),
});

export async function POST(request: Request): Promise<NextResponse> {
  // Auth — voice playback is a patient feature
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "VOICE_UNAVAILABLE" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "VOICE_INVALID_REQUEST" },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "VOICE_INVALID_REQUEST" },
      { status: 400 }
    );
  }

  try {
    const result = await sarvamTTS.synthesize(parsed.data.text, {
      language: parsed.data.languageCode,
    });

    const bytes = new Uint8Array(result.audio);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const audioBase64 = Buffer.from(binary, "binary").toString("base64");

    return NextResponse.json({
      success: true,
      audioBase64,
      mimeType: result.mimeType,
    });
  } catch (err: unknown) {
    if (err instanceof VoiceProviderError) {
      console.error(`[text-to-speech] ${err.code}: ${err.message}`);
      const status =
        err.code === "VOICE_NOT_CONFIGURED" ? 503 :
        err.code === "VOICE_INVALID_REQUEST" ? 400 :
        err.code === "VOICE_RATE_LIMITED" ? 429 :
        err.code === "VOICE_TIMEOUT" ? 504 :
        502;
      return NextResponse.json({ success: false, error: err.code }, { status });
    }
    console.error("[text-to-speech] unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: "VOICE_SYNTHESIS_FAILED" },
      { status: 502 }
    );
  }
}
