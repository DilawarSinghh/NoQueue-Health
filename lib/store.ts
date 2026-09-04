import { create } from "zustand";
import type { PatientIntakePartial } from "@/lib/schema";
import type { ChatMessage } from "@/types/patient";

// Client-side state for the whole flow. Patient data lives ONLY here until
// the user explicitly confirms on the review screen (spec §6) — never in
// URL params, never persisted to localStorage in this MVP.

interface IntakeStore {
  /** Consent gate (§6) — intake refuses to run without it. */
  consented: boolean;
  setConsented: (consented: boolean) => void;

  /** Structured data collected so far. */
  data: PatientIntakePartial;
  setData: (data: PatientIntakePartial) => void;

  /** Chat transcript. */
  conversation: ChatMessage[];
  setConversation: (conversation: ChatMessage[]) => void;

  /** Signed PDF URL, set after successful generation in Step 5. */
  pdfUrl: string | null;
  setPdfUrl: (pdfUrl: string | null) => void;

  /** Clear everything ("Start another"). */
  reset: () => void;
}

export const useIntakeStore = create<IntakeStore>((set) => ({
  consented: false,
  setConsented: (consented) => set({ consented }),
  data: {},
  setData: (data) => set({ data }),
  conversation: [],
  setConversation: (conversation) => set({ conversation }),
  pdfUrl: null,
  setPdfUrl: (pdfUrl) => set({ pdfUrl }),
  reset: () => set({ consented: false, data: {}, conversation: [], pdfUrl: null }),
}));
