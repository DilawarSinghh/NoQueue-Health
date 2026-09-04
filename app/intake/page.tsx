"use client";

// Chat intake screen — Step 3 (build /api/chat + this screen)
//
// TODO(Step 3):
// - Chat-style UI: AI bubbles left, user bubbles right (<ChatBubble />),
//   wrapped in <GlassCard />.
// - On mount: POST /api/chat with empty conversation to get the AI's first
//   question.
// - On user answer: send full conversation history + current partial
//   structured data to POST /api/chat → returns updatedData + nextQuestion
//   OR isComplete.
// - When isComplete: auto-navigate to /review, passing structured data via
//   Zustand store (NOT URL params — patient data must never leak into URLs).
// - Progress indicator: "N of M fields collected", computed client-side by
//   checking which schema keys are non-empty.
// - Chat input fixed to bottom of viewport, keyboard-safe (mobile-first).
// - Friendly, user-visible error message if the AI call fails (spec §7.7).
export default function IntakePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <p className="text-center text-muted-foreground">
        Chat intake screen — scaffolded, logic comes in Step 3.
      </p>
    </main>
  );
}
