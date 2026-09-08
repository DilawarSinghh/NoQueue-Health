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
  // Tier metadata — stored in intake_records for history page
  tier:                        z.enum(["low", "high"]).default("low"),
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
    tier, fallbackOccurred,
  } = parsed.data;

  // Ensure the calling user owns this intake
  if (user.id !== patientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // 1. Generate clinical summary
    const clinicalSummary = await generateClinicalSummary(intakeData, patientName);

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

    // 3. Upload PDF to Supabase Storage (service role — bypasses RLS)
    const admin    = getSupabaseAdmin();
    const fileName = `${patientId}/${Date.now()}-intake.pdf`;
    const bucket   = "patient-pdfs";

    // Ensure bucket exists (idempotent)
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === bucket)) {
      await admin.storage.createBucket(bucket, { public: false, fileSizeLimit: "10MB" });
    }

    const { error: uploadErr } = await admin.storage
      .from(bucket)
      .upload(fileName, pdfBuffer, { contentType: "application/pdf", upsert: false });

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    // 4. Signed URL (1 hour — patient downloads immediately; re-fetch from intake_records later)
    const { data: signed, error: signErr } = await admin.storage
      .from(bucket)
      .createSignedUrl(fileName, 3600);

    if (signErr) throw new Error(`Signed URL failed: ${signErr.message}`);
    const pdfUrl = signed.signedUrl;

    // 5. Insert intake_record
    const { error: dbErr } = await admin.from("intake_records").insert({
      patient_id:              patientId,
      structured_data:         intakeData,
      clinical_summary:        clinicalSummary,
      pdf_url:                 fileName,   // store path, not signed URL (URL expires)
      tier,
      fallback_occurred:       fallbackOccurred,
      recommended_department:  recommendedDepartment ?? intakeData.doctorOrDepartment ?? null,
    });
    if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`);

    // 6. Email PDF via Resend (best-effort — don't fail the response if email errors)
    const doctorEmail = process.env.DOCTOR_REPORT_EMAIL;
    if (doctorEmail && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
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
      } catch (emailErr) {
        // Non-fatal — log but don't surface to patient
        console.error("Email send failed (non-fatal):", emailErr);
      }
    }

    return NextResponse.json({ success: true, pdfUrl, clinicalSummary });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Report generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
