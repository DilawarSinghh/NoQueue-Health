import { NextResponse } from "next/server";

// POST /api/generate-pdf — Step 5 (server-side only)
//
// TODO(Step 5):
// - Validate incoming JSON against patientIntakeSchema (Zod) — never trust
//   client validation alone (spec §6).
// - Render PDF via lib/pdfTemplate.tsx (@react-pdf/renderer renderToBuffer):
//   clinic letterhead header, labeled rows per field, generated timestamp,
//   footer "Generated via Scriba — verified by patient/family."
// - Upload buffer to Supabase Storage bucket "patient-pdfs".
// - Return a signed URL: { pdfUrl }.
// - SECURITY: SUPABASE_SERVICE_ROLE_KEY is server-only.
export async function POST(request: Request) {
  return NextResponse.json(
    { error: "Not implemented yet — Step 5" },
    { status: 501 }
  );
}
