import { create } from "zustand";
import type { IntakeDataPartial, PatientContext } from "@/lib/schema";
import type { Department } from "@/lib/constants/hospital";

// Client-side state for the AI intake flow.
// Data lives ONLY here until the patient explicitly confirms on the review
// screen — never in URL params, never in localStorage in v1.

export type IntakeTier     = "low" | "high";
export type IntakeLanguage = "en" | "hi";

export interface ChatMessage {
  role:    "user" | "assistant" | "system";
  content: string;
}

interface IntakeStore {
  // ── Tier + language ─────────────────────────────────────────────────────
  /** Which model tier the patient chose for this session. */
  tier: IntakeTier;
  setTier: (tier: IntakeTier) => void;

  /** Conversation language — 'hi' only available on High tier. */
  language: IntakeLanguage;
  setLanguage: (lang: IntakeLanguage) => void;

  /**
   * True if Kimi K3 failed and the session fell back to Groq mid-session.
   * Stored here so it can be passed to intake_records on save.
   */
  fallbackOccurred: boolean;
  setFallbackOccurred: (v: boolean) => void;

  // ── Consent ──────────────────────────────────────────────────────────────
  consented: boolean;
  setConsented: (v: boolean) => void;

  // ── Patient context ──────────────────────────────────────────────────────
  patientContext: PatientContext | null;
  setPatientContext: (ctx: PatientContext) => void;

  // ── Structured intake data ───────────────────────────────────────────────
  data: IntakeDataPartial;
  setData: (data: IntakeDataPartial) => void;

  // ── Conversation transcript ──────────────────────────────────────────────
  conversation: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  setConversation: (msgs: ChatMessage[]) => void;

  // ── Output ───────────────────────────────────────────────────────────────
  clinicalSummary: string;
  setClinicalSummary: (s: string) => void;

  pdfUrl: string | null;
  setPdfUrl: (url: string | null) => void;

  // ── Department recommendation ─────────────────────────────────────────────
  recommendedDepartment: Department | null;
  setRecommendedDepartment: (dept: Department | null) => void;

  recommendedDepartmentReason: string;
  setRecommendedDepartmentReason: (reason: string) => void;

  alternateDepartment: Department | null;
  setAlternateDepartment: (dept: Department | null) => void;

  // ── Suggested investigations ──────────────────────────────────────────────
  suggestedInvestigations: string[];
  setSuggestedInvestigations: (items: string[]) => void;

  investigationsDisclaimer: string;
  setInvestigationsDisclaimer: (text: string) => void;

  // ── Reset ─────────────────────────────────────────────────────────────────
  /** Full reset for a new intake session. Tier/language are preserved so the
   *  user doesn't have to re-pick them if they start over. */
  reset: () => void;
}

export const useIntakeStore = create<IntakeStore>((set, get) => ({
  // ── Tier + language ─────────────────────────────────────────────────────
  tier:               "low",
  setTier:            (tier)    => set({ tier }),

  language:           "en",
  setLanguage:        (lang)    => set({ language: lang }),

  fallbackOccurred:   false,
  setFallbackOccurred: (v)      => set({ fallbackOccurred: v }),

  // ── Consent ──────────────────────────────────────────────────────────────
  consented:          false,
  setConsented:       (v)       => set({ consented: v }),

  // ── Patient context ──────────────────────────────────────────────────────
  patientContext:     null,
  setPatientContext:  (ctx)     => set({ patientContext: ctx }),

  // ── Structured intake data ───────────────────────────────────────────────
  data:               {},
  setData:            (data)    => set({ data }),

  // ── Conversation transcript ──────────────────────────────────────────────
  conversation:       [],
  addMessage:         (msg)     => set((s) => ({ conversation: [...s.conversation, msg] })),
  setConversation:    (msgs)    => set({ conversation: msgs }),

  // ── Output ───────────────────────────────────────────────────────────────
  clinicalSummary:    "",
  setClinicalSummary: (s)       => set({ clinicalSummary: s }),

  pdfUrl:             null,
  setPdfUrl:          (url)     => set({ pdfUrl: url }),

  // ── Department recommendation ─────────────────────────────────────────────
  recommendedDepartment:          null,
  setRecommendedDepartment:       (dept)   => set({ recommendedDepartment: dept }),

  recommendedDepartmentReason:    "",
  setRecommendedDepartmentReason: (reason) => set({ recommendedDepartmentReason: reason }),

  alternateDepartment:            null,
  setAlternateDepartment:         (dept)   => set({ alternateDepartment: dept }),

  // ── Suggested investigations ──────────────────────────────────────────────
  suggestedInvestigations:        [],
  setSuggestedInvestigations:     (items)  => set({ suggestedInvestigations: items }),

  investigationsDisclaimer:       "",
  setInvestigationsDisclaimer:    (text)   => set({ investigationsDisclaimer: text }),

  // ── Reset ─────────────────────────────────────────────────────────────────
  reset: () => {
    const { tier, language } = get(); // preserve tier/language across restarts
    set({
      tier,
      language,
      fallbackOccurred:            false,
      consented:                   false,
      patientContext:              null,
      data:                        {},
      conversation:                [],
      clinicalSummary:             "",
      pdfUrl:                      null,
      recommendedDepartment:       null,
      recommendedDepartmentReason: "",
      alternateDepartment:         null,
      suggestedInvestigations:     [],
      investigationsDisclaimer:    "",
    });
  },
}));
