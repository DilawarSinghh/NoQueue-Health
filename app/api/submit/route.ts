import { NextResponse } from "next/server";

// POST /api/submit — Step 6 (server-side only)
//
// TODO(Step 6):
// - Receives: { data: PatientIntake, pdfUrl: string }.
// - Validate data against patientIntakeSchema (Zod) again at this boundary.
// - Insert record into Supabase table `intake_records`
//   (columns matching schema fields + pdf_url + created_at).
// - Fetch the PDF from the signed URL and send email via Resend to
//   process.env.HOSPITAL_NOTIFY_EMAIL, attaching the PDF if size allows
//   (otherwise link to it).
// - Return: { success: true }.
// - SECURITY: RESEND_API_KEY + SUPABASE_SERVICE_ROLE_KEY are server-only.
export async function POST(request: Request) {
  return NextResponse.json(
    { error: "Not implemented yet — Step 6" },
    { status: 501 }
  );
}
