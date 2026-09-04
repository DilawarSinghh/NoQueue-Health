"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCcw, SendHorizonal } from "lucide-react";

import { ChatBubble } from "@/components/ChatBubble";
import { Button } from "@/components/ui/button";
import { CLINIC_NAME } from "@/lib/clinic";
import {
  countCollectedFields,
  TOTAL_FIELDS,
  type PatientIntakePartial,
} from "@/lib/schema";
import { useIntakeStore } from "@/lib/store";
import type { ChatMessage } from "@/types/patient";

const INIT_ERROR =
  "We couldn't start the intake assistant just now. Please check your connection and try again.";
const SEND_ERROR =
  "Your answer didn't go through. Please try again — nothing has been saved or submitted yet.";

interface ChatApiResponse {
  updatedData?: PatientIntakePartial;
  nextQuestion?: string | null;
  isComplete?: boolean;
  error?: string;
}

export default function IntakePage() {
  const router = useRouter();

  const consented = useIntakeStore((s) => s.consented);
  const data = useIntakeStore((s) => s.data);
  const setData = useIntakeStore((s) => s.setData);
  const conversation = useIntakeStore((s) => s.conversation);
  const setConversation = useIntakeStore((s) => s.setConversation);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const startLock = useRef(false);

  // Consent gate — no data collection before consent (spec §6)
  useEffect(() => {
    if (!consented) router.replace("/");
  }, [consented, router]);

  const callChatApi = useCallback(
    async (conv: ChatMessage[], currentData: PatientIntakePartial) => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation: conv, currentData }),
      });
      const payload = (await res.json().catch(() => null)) as
        | ChatApiResponse
        | null;
      if (!res.ok || !payload || typeof payload.updatedData === "undefined") {
        throw new Error(payload?.error || `Request failed (${res.status})`);
      }
      return payload;
    },
    []
  );

  const startConversation = useCallback(async () => {
    if (startLock.current) return;
    startLock.current = true;
    setIsLoading(true);
    setError(null);
    setShowRetry(false);
    try {
      const result = await callChatApi([], {});
      setData(result.updatedData ?? {});
      if (result.nextQuestion) {
        setConversation([{ role: "assistant", content: result.nextQuestion }]);
      }
    } catch {
      setShowRetry(true);
      setError(INIT_ERROR);
    } finally {
      setIsLoading(false);
      startLock.current = false;
    }
  }, [callChatApi, setData, setConversation]);

  useEffect(() => {
    if (consented) void startConversation();
  }, [consented, startConversation]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const newConversation = [...conversation, userMsg];
    setConversation(newConversation);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const result = await callChatApi(newConversation, data);
      const updatedData = result.updatedData ?? data;
      setData(updatedData);
      // Spec Step 3: console-log the structured data as it fills up
      console.log("[Scriba] structured data:", updatedData);

      if (result.nextQuestion) {
        setConversation([
          ...newConversation,
          { role: "assistant", content: result.nextQuestion },
        ]);
      } else {
        setConversation(newConversation);
      }

      if (result.isComplete) {
        console.log("[Scriba] intake complete:", updatedData);
        setTimeout(() => router.push("/review"), 500);
      }
    } catch {
      setError(SEND_ERROR);
    } finally {
      setIsLoading(false);
    }
  }

  // Auto-scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation, isLoading, error]);

  const collected = countCollectedFields(data);
  const progressPct = Math.round((collected / TOTAL_FIELDS) * 100);

  return (
    <main className="flex min-h-dvh flex-col">
      {/* Sticky progress header */}
      <header className="sticky top-0 z-10 border-b border-white/40 bg-white/50 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{CLINIC_NAME}</p>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {collected} of {TOTAL_FIELDS} fields collected
            </p>
          </div>
          <div
            className="h-2 w-24 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={collected}
            aria-valuemin={0}
            aria-valuemax={TOTAL_FIELDS}
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 pb-44 pt-4">
        {conversation.map((message, index) => (
          <ChatBubble
            key={`${message.role}-${index}`}
            role={message.role === "assistant" ? "ai" : "user"}
          >
            {message.content}
          </ChatBubble>
        ))}

        {isLoading && (
          <ChatBubble role="ai">
            <span
              className="inline-flex items-center gap-1 py-1"
              aria-label="Assistant is typing"
            >
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:120ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:240ms]" />
            </span>
          </ChatBubble>
        )}

        {/* Friendly, visible error state (spec §7.7) — amber, never alarm-red */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-sm leading-relaxed text-amber-900"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p>{error}</p>
              {showRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void startConversation()}
                >
                  <RotateCcw aria-hidden="true" />
                  Try again
                </Button>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Fixed bottom input — keyboard-safe (safe-area padding) */}
      <footer className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white via-white/95 to-transparent pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <form
          className="mx-auto flex max-w-md items-center gap-2 px-4"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type your answer…"
            aria-label="Your answer"
            autoComplete="off"
            enterKeyHint="send"
            className="h-11 w-full rounded-xl border border-input bg-white/90 px-4 text-base shadow-sm backdrop-blur-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send answer"
            disabled={isLoading || input.trim() === ""}
          >
            <SendHorizonal aria-hidden="true" />
          </Button>
        </form>
      </footer>
    </main>
  );
}

