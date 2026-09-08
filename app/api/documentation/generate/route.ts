import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_TEMPLATES } from "@/lib/documentation/templates";
import { DocumentPdf } from "@/components/documentation/DocumentPdf";
import { formatGeneratedAt } from "@/lib/pdfTemplate";
import type { DocumentFormData } from "@/lib/documentation/types";

// ─── Request schema ───────────────────────────────────────────────────────────
// Accepts a template id + arbitrary field values (string | string[] | boolean).
// The template definition is the source of truth for which fields are allowed;
// we only render fields that exist on the template, so extra keys are ignored.
const requestSchema = z.object({
  templateId: z.string().min(1),
  patientName: z.string().min(1).max(200),
  data: z.record(
    z.string(),
    z.union([z.string(), z.array(z.string()), z.boolean()])
  ),
});

export async function POST(req: Request) {
  // 1. Auth — documentation is patient-only, protected by RLS/session.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate the payload.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { templateId, patientName, data } = parsed.data;

  // 3. Look up the template (must be active).
  const template = DOCUMENT_TEMPLATES.find((t) => t.id === templateId && t.active);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // 4. Render the PDF in-memory (no persistence — returned as base64).
  try {
    const generatedAt = formatGeneratedAt(new Date());
    // renderToBuffer expects @react-pdf's own ReactElement type — cast through
    // unknown to satisfy the strict type mismatch between pdf-renderer and React.
    const pdfBuffer = await renderToBuffer(
      createElement(DocumentPdf, {
        template,
        data: data as DocumentFormData,
        patientName,
        generatedAt,
      }) as unknown as Parameters<typeof renderToBuffer>[0]
    );

    const filename = `${template.id}-${patientName
      .replace(/\s+/g, "-")
      .toLowerCase()}-${Date.now()}.pdf`;

    return NextResponse.json({
      success: true,
      filename,
      mimeType: "application/pdf",
      pdfBase64: Buffer.from(pdfBuffer).toString("base64"),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "PDF generation failed";
    console.error("[documentation] PDF render failed:", msg);
    return NextResponse.json({ error: "Could not generate document" }, { status: 500 });
  }
}
