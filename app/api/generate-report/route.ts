import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import Groq from "groq-sdk";
import { Resend } from "resend";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { intakeDataSchema } from "@/lib/schema";
import { IntakePdfDocument, formatGeneratedAt } from "@/lib/pdfTemplate";

// ─── Request schema ───────────────────────────────────────────────────────────
const requestSchema = z.object({
  intakeData:                  intakeDataSchema,
  patientName:                 z.string().min(1),
  patientId:                   z.string().uuid(),
  recommendedDepartment:       z.string().optional(),
  recommendedDepartmentReason: z.string().optional(),
  suggestedInvestigations:     z.array(z.string()).max(5).default([]),
  investigationsDisclaimer:    z.string().optional(),
  // Model metadata — stored in intake_records for history page
  model:                       z.enum(["minimax-m3", "gemini", "groq"]).default("minimax-m3"),
  fallbackOccurred:            z.boolean().default(false),
});

// ─── Groq — generate clinical summary ────────────────────────────────────────
async function generateClinicalSummary(
  data: z.output<typeof intakeDataSchema>,
  patientName: string
): Promise<string> {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.6-27b"];

  const prompt = `Using the structured intake data below, write a clinical summary for a doctor.

Title: "Patient-Reported Intake Summary — For Clinical Review"

Frame every statement as patient-reported (e.g. "Patient reports…", never "Patient has…" or "Patient is diagnosed with…").

Required sections:
1. Chief Complaint
2. History of Present Illness
3. Relevant Background
4. Patient-Reported Severity

End with exactly this sentence on its own line:
"Generated from patient self-report via AI intake. Not a diagnosis. For review by a licensed clinician."

Rules:
- NO interpretation, NO likely cause, NO diagnosis beyond what the patient stated.
- Plain clinical prose, concise.
- Patient name: ${patientName}

Structured data:
${Object.entries(data)
  .map(([k, v]) => `${k}: ${v}`)
  .join("\n")}`;

  for (const model of MODELS) {
    try {
      const res = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens:  800,
      });
      const text = res.choices[0]?.message?.content?.trim();
      if (text) return text;
    } catch {
      continue;
    }
  }
  throw new Error("Failed to generate clinical summary");
}

// ─── Plain-text fallback summary (used if the AI summary model is unavailable) ─
function buildPlainSummary(
  data: z.output<typeof intakeDataSchema>,
  patientName: string
): string {
  const lines = Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return [
    `Patient: ${patientName}`,
    ...lines,
    "",
    "Generated from patient self-report via AI intake. Not a diagnosis. For review by a licensed clinician.",
  ].join("\n");
}

// ─── Classify Resend errors into safe internal codes ──────────────────────────
function classifyEmailError(e: { statusCode?: number; message?: string }): string {
  const sc = e?.statusCode;
  if (sc === 401 || sc === 403) return "EMAIL_AUTH_ERROR";
  if (sc === 422) return "EMAIL_INVALID_RECIPIENT";
  if (sc === 429) return "EMAIL_RATE_LIMITED";
  if (sc != null && sc >= 500) return "EMAIL_PROVIDER_ERROR";
  return "EMAIL_PROVIDER_ERROR";
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  // Auth check — must be logged-in patient
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse + validate body
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    intakeData, patientName, patientId,
    recommendedDepartment, suggestedInvestigations, investigationsDisclaimer,
    model, fallbackOccurred,
  } = parsed.data;

  // Ensure the calling user owns this intake
  if (user.id !== patientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Clinical summary — best-effort. A summary-model failure must never block
  //    PDF generation or email delivery.
  let clinicalSummary = "";
  try {
    clinicalSummary = await generateClinicalSummary(intakeData, patientName);
  } catch (summaryErr) {
    console.error("[generate-report] Clinical summary generation failed:", summaryErr instanceof Error ? summaryErr.message : summaryErr);
    clinicalSummary = buildPlainSummary(intakeData, patientName);
  }

  try {
    // 2. Render PDF
    const generatedAt = formatGeneratedAt(new Date());
    // renderToBuffer expects @react-pdf's own ReactElement type — cast through
    // unknown to satisfy the strict type mismatch between pdf-renderer and React.
    const pdfBuffer = await renderToBuffer(
      createElement(IntakePdfDocument, {
        data:                    intakeData,
        clinicalSummary,
        patientName,
        generatedAt,
        recommendedDepartment:   recommendedDepartment ?? intakeData.doctorOrDepartment,
        suggestedInvestigations: suggestedInvestigations.length > 0 ? suggestedInvestigations : undefined,
        investigationsDisclaimer: investigationsDisclaimer || undefined,
      }) as unknown as Parameters<typeof renderToBuffer>[0]
    );

    // 3. Upload PDF to Supabase Storage + insert intake_record (best-effort).
    //    A storage/DB failure must NOT block email delivery — we already hold
    //    the PDF bytes in memory for the attachment.
    const admin      = getSupabaseAdmin();
    const bucket     = "patient-pdfs";
    let pdfUrl: string | null = null;
    let storageError: string | null = null;

    try {
      const fileName = `${patientId}/${Date.now()}-intake.pdf`;

      // Ensure bucket exists (idempotent)
      const { data: buckets } = await admin.storage.listBuckets();
      if (!buckets?.some((b) => b.name === bucket)) {
        await admin.storage.createBucket(bucket, { public: false, fileSizeLimit: "10MB" });
      }

      const { error: uploadErr } = await admin.storage
        .from(bucket)
        .upload(fileName, pdfBuffer, { contentType: "application/pdf", upsert: false });
      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

      // Signed URL (1 hour — patient downloads immediately; history re-fetches later)
      const { data: signed, error: signErr } = await admin.storage
        .from(bucket)
        .createSignedUrl(fileName, 3600);
      if (signErr) throw new Error(`Signed URL failed: ${signErr.message}`);
      pdfUrl = signed.signedUrl;

      // Insert intake_record (stores the storage path, not the expiring URL)
      const { error: dbErr } = await admin.from("intake_records").insert({
        patient_id:             patientId,
        structured_data:        intakeData,
        clinical_summary:       clinicalSummary,
        pdf_url:                fileName,
        tier:                   model,     // minimax-m3 | gemini | groq (internal)
        fallback_occurred:      fallbackOccurred,
        recommended_department: recommendedDepartment ?? intakeData.doctorOrDepartment ?? null,
      });
      if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`);
    } catch (storageErr) {
      storageError = storageErr instanceof Error ? storageErr.message : "Storage failed";
      console.error("[generate-report] Storage/DB step failed (non-fatal):", storageError);
    }

    // 4. Email the report via Resend. Always attempted when configured. The
    //    result is classified and returned so the UI tells the patient exactly
    //    what happened (sent vs. failed vs. skipped) — never assumes success.
    let emailStatus: "sent" | "failed" | "skipped" = "skipped";
    let emailErrorCode: string | null = null;

    const doctorEmail = process.env.DOCTOR_REPORT_EMAIL;
    if (doctorEmail && process.env.RESEND_API_KEY && pdfBuffer.byteLength > 0) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { data: emailData, error: emailErr } = await resend.emails.send({
          from:        process.env.RESEND_FROM_EMAIL ?? "NoQueue Health <onboarding@resend.dev>",
          to:          [doctorEmail],
          subject:     `Patient Intake Report — ${patientName} — ${generatedAt}`,
          html:        `<p>Please find the patient intake report for <strong>${patientName}</strong> attached.</p>
                        <p>Generated: ${generatedAt}</p>
                        <p><em>Generated from patient self-report via AI intake. Not a diagnosis. For review by a licensed clinician.</em></p>`,
          attachments: [
            {
              filename:    `intake-${patientName.replace(/\s+/g, "-")}-${Date.now()}.pdf`,
              content:     pdfBuffer.toString("base64"),
            },
          ],
        });

        if (emailErr) {
          emailStatus = "failed";
          emailErrorCode = classifyEmailError(emailErr);
          console.error(`[generate-report] Email failed (${emailErrorCode}):`, emailErr.message ?? emailErr);
        } else if (emailData?.id) {
          emailStatus = "sent";
        } else {
          emailStatus = "failed";
          emailErrorCode = "EMAIL_PROVIDER_ERROR";
        }
      } catch (emailThrow) {
        emailStatus = "failed";
        emailErrorCode = "EMAIL_PROVIDER_ERROR";
        console.error("[generate-report] Email threw:", emailThrow instanceof Error ? emailThrow.message : emailThrow);
      }
    } else {
      emailStatus = "skipped";
      emailErrorCode = "EMAIL_CONFIGURATION_ERROR";
    }

    return NextResponse.json({
      success:       true,
      pdfUrl,
      clinicalSummary,
      emailStatus,
      emailErrorCode,
      storageError,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Report generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
