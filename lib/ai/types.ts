/**
 * lib/ai/types.ts
 *
 * Common types for the provider-agnostic AI abstraction.
 * Every provider (MiniMax, Gemini, Groq) returns this normalized shape.
 */

import type { IntakeDataPartial } from "@/lib/schema";

/** Emergency response — highest priority, stops intake immediately. */
export interface EmergencyResponse {
  emergency: true;
  message: string;
}

/** Normal response — ongoing intake or completion. */
export interface NormalResponse {
  emergency: false;
  updatedData: IntakeDataPartial;
  nextQuestion: string | null;
  isComplete: boolean;
  recommendedDepartment?: string;
  recommendedDepartmentReason?: string;
  alternateDepartment?: string;
  suggestedInvestigations?: string[];
  investigationsDisclaimer?: string;
}

/** Union of all possible AI responses. */
export type AIResponse = EmergencyResponse | NormalResponse;

/** Context passed to every provider. */
export interface AIRequest {
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  patientContext: {
    name: string;
    age: number | null;
    gender: string | null;
    allergies: string | null;
    chronicConditions: string | null;
  };
  currentStructuredData: Record<string, string>;
  language: "en" | "hi" | "auto";
}

/** Provider identifier — safe to send to the client. */
export type AIProviderId = "minimax-m3" | "gemini" | "groq";

/** Provider metadata for the UI. Labels are patient-facing — real provider
 *  names (MiniMax/Gemini/Groq) are hidden; patients only see "AI Agent N". */
export interface AIProviderInfo {
  id: AIProviderId;
  /** Patient-facing display name — never the real provider name. */
  name: string;
  description: string;
  supportsVoice: boolean;
  supportsHindi: boolean;
  icon: "Zap" | "Sparkles" | "Brain";
}

/**
 * Map an internal provider id to a patient-facing "AI Agent N" label.
 * Kept central so no patient UI ever leaks the real provider/model name.
 */
const PROVIDER_DISPLAY: Record<AIProviderId, string> = {
  "minimax-m3": "AI Agent 1",
  gemini: "AI Agent 2",
  groq: "AI Agent 3",
};

/** Patient-safe display name for a provider id. */
export function providerDisplayName(id: AIProviderId | string | null | undefined): string {
  if (id && id in PROVIDER_DISPLAY) return PROVIDER_DISPLAY[id as AIProviderId];
  return "AI Assistant";
}

/** All available providers in fallback order. */
export const AI_PROVIDERS: AIProviderInfo[] = [
  {
    id: "minimax-m3",
    name: "AI Agent 1",
    description: "Fast and helpful",
    supportsVoice: true,
    supportsHindi: true,
    icon: "Zap",
  },
  {
    id: "gemini",
    name: "AI Agent 2",
    description: "Balanced and multilingual",
    supportsVoice: true,
    supportsHindi: true,
    icon: "Sparkles",
  },
  {
    id: "groq",
    name: "AI Agent 3",
    description: "Reliable",
    supportsVoice: false,
    supportsHindi: false,
    icon: "Brain",
  },
];

/** Result from a provider attempt. */
export interface ProviderResult {
  success: boolean;
  response?: AIResponse;
  error?: string;
  provider: AIProviderId;
  model?: string;
  durationMs: number;
}
