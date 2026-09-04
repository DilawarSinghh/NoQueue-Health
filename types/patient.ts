import { z } from "zod";
import { patientIntakeSchema } from "@/lib/schema";

// Types generated from / matching lib/schema.ts — UI code never hand-writes
// patient shapes.
export type PatientIntake = z.output<typeof patientIntakeSchema>;
export type PatientIntakeInput = z.input<typeof patientIntakeSchema>;

/** Conversation turn exchanged with /api/chat. */
export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

