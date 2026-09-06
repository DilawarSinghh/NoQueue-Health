// types/patient.ts — re-exports from lib/schema for backwards compatibility.
// The canonical types now live in lib/schema.ts.
export type { IntakeData, IntakeDataPartial, PatientContext } from "@/lib/schema";

/** Conversation turn used by the AI intake chat UI. */
export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role:    ChatRole;
  content: string;
}
