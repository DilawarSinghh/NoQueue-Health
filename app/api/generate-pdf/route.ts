import { createElement, type ReactElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

import { CLINIC_NAME } from "@/lib/clinic";
import { formatGeneratedAt, IntakePdfDocument } from "@/lib/pdfTemplate";
import { patientIntakeSchema } from "@/lib/schema";
import {
  ensurePatientPdfsBucket,
  getSupabaseAdmin,
  PATIENT_PDFS_BUCKET,
} from "@/lib/supabase";

// POST /api/generate-pdf — server-side only (spec §4, §6).
// Validates the payload with the Zod schema again (never trusts client-side
// validation), renders the PDF, uploads it to the private "patient-pdfs"
// Storage bucket, and returns a signed URL.

export const runtime = "nodejs";

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24; // 24 hours

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request. Please go back and try again." },
      { status: 400 }
    );
  }

  // Server-side validation — the review screen's client check is not trusted.
  const parsed = patientIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Some details are missing or invalid. Please go back, review your information, and try again.",
      },
      { status: 400 }
    );
  }
  const data = parsed.data;
  if (!data.knownAllergies.trim()) {
    data.knownAllergies = "None reported";
  }

  try {
    // renderToBuffer types accept a Document element; our wrapper component
    // renders one, so the cast is safe at runtime.
    const pdfElement = createElement(IntakePdfDocument, {
      data,
      clinicName: CLINIC_NAME,
      generatedAt: formatGeneratedAt(new Date()),
    }) as unknown as ReactElement<DocumentProps>;
    const pdfBuffer = await renderToBuffer(pdfElement);

    const admin = getSupabaseAdmin();
    await ensurePatientPdfsBucket(admin);

    const dateFolder = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const fileName = `${dateFolder}/${crypto.randomUUID()}.pdf`;

    const { error: uploadError } = await admin.storage
      .from(PATIENT_PDFS_BUCKET)
      .upload(fileName, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: signed, error: signError } = await admin.storage
      .from(PATIENT_PDFS_BUCKET)
      .createSignedUrl(fileName, SIGNED_URL_EXPIRY_SECONDS);
    if (signError || !signed) {
      throw signError ?? new Error("Failed to create signed URL");
    }

    return NextResponse.json({ pdfUrl: signed.signedUrl });
  } catch (err) {
    console.error("[Scriba] PDF generation failed:", err);
    return NextResponse.json(
      {
        error:
          "We couldn't create your PDF right now. Please try again in a moment.",
      },
      { status: 502 }
    );
  }
}

