"use client";

// Review & edit screen — Step 4
//
// TODO(Step 4):
// - Render every schema field as an editable input via <ReviewField />,
//   pre-filled from the structured data collected in intake (Zustand store).
// - Highlight required fields that are empty or failed validation — amber
//   warning styling only, never red-on-white alarm styling (spec §5).
// - Re-validate against patientIntakeSchema (Zod) client-side on every
//   change; "Confirm & Generate PDF" disabled until all required fields valid.
// - On confirm: POST final validated JSON to /api/generate-pdf, then
//   POST data + pdfUrl to /api/submit, then navigate to /success passing
//   the signed pdfUrl via state (Zustand, not URL params).
// - Friendly, user-visible error messages if PDF generation or submission
//   fails (spec §7.7).
export default function ReviewPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <p className="text-center text-muted-foreground">
        Review screen — scaffolded, logic comes in Step 4.
      </p>
    </main>
  );
}
