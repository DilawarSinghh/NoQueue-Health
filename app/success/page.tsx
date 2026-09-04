"use client";

// Success / delivery screen — Step 6
//
// TODO(Step 6):
// - Confirmation message: "Your details have been sent to {clinicName}."
// - "Download PDF" button linking to the signed URL (passed via Zustand
//   state from the review step — never via URL params).
// - "Start another" button routing back to the landing screen.
// - If pdfUrl is missing (e.g. user landed here directly), show a friendly
//   message and route back to landing.
export default function SuccessPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <p className="text-center text-muted-foreground">
        Success screen — scaffolded, logic comes in Step 6.
      </p>
    </main>
  );
}
