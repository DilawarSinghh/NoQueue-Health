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
  language: "en" | "hi";
}

/** Provider identifier — safe to send to the client. */
export type AIProviderId = "minimax-m3" | "gemini" | "groq";

/** Provider metadata for the UI. */
export interface AIProviderInfo {
  id: AIProviderId;
  name: string;
  description: string;
  supportsVoice: boolean;
  supportsHindi: boolean;
  icon: "Zap" | "Sparkles" | "Brain";
}

/** All available providers in fallback order. */
export const AI_PROVIDERS: AIProviderInfo[] = [
  {
    id: "minimax-m3",
    name: "MiniMax M3",
    description: "Fast · Free tier available",
    supportsVoice: true,
    supportsHindi: true,
    icon: "Zap",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Balanced · Multilingual",
    supportsVoice: true,
    supportsHindi: true,
    icon: "Sparkles",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Reliable fallback · English",
    supportsVoice: true,
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
