import { create } from "zustand";
import type { IntakeDataPartial, PatientContext } from "@/lib/schema";
import type { Department } from "@/lib/constants/hospital";

// Client-side state for the AI intake flow.
// Data lives ONLY here until the patient explicitly confirms on the review
// screen — never in URL params, never in localStorage in v1.

export interface ChatMessage {
  role:    "user" | "assistant";
  content: string;
}

interface IntakeStore {
  /** Consent gate — intake refuses to run without this. */
  consented: boolean;
  setConsented: (v: boolean) => void;

  /** Pre-filled patient context pulled from profiles + patient_profiles. */
  patientContext: PatientContext | null;
  setPatientContext: (ctx: PatientContext) => void;

  /** Structured data collected so far (partial until complete). */
  data: IntakeDataPartial;
  setData: (data: IntakeDataPartial) => void;

  /** Full conversation transcript. */
  conversation: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  setConversation: (msgs: ChatMessage[]) => void;

  /** AI-generated clinical summary (set on the review screen). */
  clinicalSummary: string;
  setClinicalSummary: (s: string) => void;

  /** Signed PDF URL after successful generation. */
  pdfUrl: string | null;
  setPdfUrl: (url: string | null) => void;

  /** AI-recommended department (set when isComplete=true, validated server-side). */
  recommendedDepartment: Department | null;
  setRecommendedDepartment: (dept: Department | null) => void;

  /** Plain-language reason for the recommendation, written for the patient. */
  recommendedDepartmentReason: string;
  setRecommendedDepartmentReason: (reason: string) => void;

  /** Optional second-choice department if the AI was uncertain. */
  alternateDepartment: Department | null;
  setAlternateDepartment: (dept: Department | null) => void;

  /** Reset everything for a new intake session. */
  reset: () => void;
}

export const useIntakeStore = create<IntakeStore>((set) => ({
  consented:          false,
  setConsented:       (v)    => set({ consented: v }),

  patientContext:     null,
  setPatientContext:  (ctx)  => set({ patientContext: ctx }),

  data:               {},
  setData:            (data) => set({ data }),

  conversation:       [],
  addMessage:         (msg)  => set((s) => ({ conversation: [...s.conversation, msg] })),
  setConversation:    (msgs) => set({ conversation: msgs }),

  clinicalSummary:    "",
  setClinicalSummary: (s)    => set({ clinicalSummary: s }),

  pdfUrl:             null,
  setPdfUrl:          (url)  => set({ pdfUrl: url }),

  recommendedDepartment:          null,
  setRecommendedDepartment:       (dept)   => set({ recommendedDepartment: dept }),

  recommendedDepartmentReason:    "",
  setRecommendedDepartmentReason: (reason) => set({ recommendedDepartmentReason: reason }),

  alternateDepartment:            null,
  setAlternateDepartment:         (dept)   => set({ alternateDepartment: dept }),

  reset: () =>
    set({
      consented:                   false,
      patientContext:              null,
      data:                        {},
      conversation:                [],
      clinicalSummary:             "",
      pdfUrl:                      null,
      recommendedDepartment:       null,
      recommendedDepartmentReason: "",
      alternateDepartment:         null,
    }),
}));
