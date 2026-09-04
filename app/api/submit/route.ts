import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

import {
  FIELD_LABELS,
  FIELD_ORDER,
  patientIntakeSchema,
  type PatientIntake,
} from "@/lib/schema";
import { getSupabaseAdmin, PATIENT_PDFS_BUCKET } from "@/lib/supabase";

// POST /api/submit — server-side only (spec §4, §6). Stores the record in
// Supabase and emails the clinic the signed-off PDF. Secrets (service role,
// Resend) never leave the server.

export const runtime = "nodejs";

const requestSchema = z.object({
  data: patientIntakeSchema,
  pdfUrl: z.string().url(),
});

const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024; // attach if PDF is <= 6MB

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(data: PatientIntake, pdfUrl: string): string {
  const rows = FIELD_ORDER.map((key) => {
    const value = data[key];
    const display =
      value === undefined || String(value).trim() === ""
        ? "Not provided"
        : escapeHtml(String(value));
    return `<tr><td style="padding:6px 12px;color:#64748b;white-space:nowrap">${escapeHtml(FIELD_LABELS[key])}</td><td style="padding:6px 12px;color:#1e293b">${display}</td></tr>`;
  }).join("");
  return `<div style="font-family:Helvetica,Arial,sans-serif;max-width:640px">
    <h2 style="color:#3b8f9a">New patient intake — ${escapeHtml(data.patientName)}</h2>
    <p style="color:#64748b;font-size:14px">Submitted via Scriba. The signed PDF is attached${
      "" /* attachment or link handled in code */
    }. You can also open it here:</p>
    <p><a href="${escapeHtml(pdfUrl)}">Open the intake PDF</a></p>
    <table style="border-collapse:collapse;font-size:14px">${rows}</table>
  </div>`;
}

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

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Some details are missing or invalid. Please go back and review your information.",
      },
      { status: 400 }
    );
  }

  const { data, pdfUrl } = parsed.data;

  // Only accept signed URLs from OUR bucket (never a client-supplied location).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (
    !supabaseUrl ||
    !pdfUrl.startsWith(
      `${supabaseUrl}/storage/v1/object/sign/${PATIENT_PDFS_BUCKET}/`
    )
  ) {
    return NextResponse.json(
      { error: "Invalid document reference. Please go back and try again." },
      { status: 400 }
    );
  }

  const notifyEmail = process.env.HOSPITAL_NOTIFY_EMAIL;
  if (!notifyEmail) {
    console.error("[Scriba] HOSPITAL_NOTIFY_EMAIL is not set");
    return NextResponse.json(
      {
        error:
          "The clinic's notification inbox is not configured. Please contact the clinic directly.",
      },
      { status: 500 }
    );
  }

  // 1) Store the record (spec: table intake_records)
  const admin = getSupabaseAdmin();
  const { error: insertError } = await admin
    .from("intake_records")
    .insert({ ...data, pdf_url: pdfUrl, created_at: new Date().toISOString() });

  if (insertError) {
    console.error("[Scriba] Supabase insert failed:", insertError);
    const missingTable = insertError.code === "42P01"; // undefined_table
    return NextResponse.json(
      {
        error: missingTable
          ? "The clinic's records system isn't set up yet. Please try again later or contact the clinic directly."
          : "We couldn't save your form. Please try again — your PDF has already been created.",
      },
      { status: 502 }
    );
  }

  // 2) Fetch the PDF and email the clinic via Resend
  try {
    let attachment: { filename: string; content: string } | undefined;
    let pdfBytes: number | undefined;
    try {
      const pdfRes = await fetch(pdfUrl);
      if (pdfRes.ok) {
        const buffer = Buffer.from(await pdfRes.arrayBuffer());
        pdfBytes = buffer.length;
        if (buffer.length <= MAX_ATTACHMENT_BYTES) {
          attachment = {
            filename: `intake-${data.patientName.replace(/[^\w-]+/g, "-")}.pdf`,
            content: buffer.toString("base64"),
          };
        }
      }
    } catch (fetchErr) {
      // Non-fatal: fall back to a link in the email body
      console.error("[Scriba] PDF fetch for attachment failed:", fetchErr);
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail =
      process.env.RESEND_FROM_EMAIL || "Scriba <onboarding@resend.dev>";

    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: notifyEmail,
      subject: `New patient intake — ${data.patientName}`,
      html: buildEmailHtml(
        data,
        pdfUrl + (attachment ? "" : " (attachment too large — use this link)")
      ),
      attachments: attachment ? [attachment] : undefined,
    });
    if (emailError) throw emailError;

    return NextResponse.json({
      success: true,
      ...(pdfBytes !== undefined ? { pdfSize: pdfBytes } : {}),
    });
  } catch (err) {
    console.error("[Scriba] Resend email failed:", err);
    return NextResponse.json(
      {
        error:
          "Your form was saved, but notifying the clinic failed. Please try again — your PDF is safe.",
      },
      { status: 502 }
    );
  }
}

