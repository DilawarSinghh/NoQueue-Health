"use client";

// ReviewField — editable field row for the review screen (Step 4)
//
// TODO(Step 4):
// - Props: label, value, onChange, required, error (validation message).
// - Renders a labeled input row; when a required field is empty or fails
//   Zod validation, show an amber warning highlight/border + helper text
//   (never harsh red-on-white alarm styling, per spec §5).
// - Large, phone-friendly tap targets (16px+ body text).
export function ReviewField(_props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string | null;
}) {
  return null; // scaffold — implemented in Step 4
}
