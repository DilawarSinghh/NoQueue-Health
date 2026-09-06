"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, ChevronDown, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LocalMessage {
  id:           string;
  role:         "user" | "assistant";
  content:      string;
  created_at:   string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function SiteAssistant() {
  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState<LocalMessage[]>([]);
  const [threadId, setThreadId]       = useState<string | null>(null);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Load history from server when widget first opens
  useEffect(() => {
    if (!open || historyLoaded) return;

    fetch("/api/site-assistant")
      .then((r) => r.json())
      .then(({ messages: hist, threadId: tid }) => {
        if (hist && hist.length > 0) {
          setMessages(
            hist.map((m: { id: string; is_assistant: boolean; content: string; created_at: string }) => ({
              id:         m.id,
              role:       m.is_assistant ? "assistant" : "user",
              content:    m.content,
              created_at: m.created_at,
            }))
          );
        } else {
          // First-time greeting
          setMessages([{
            id:         "welcome",
            role:       "assistant",
            content:    "Hi! I'm the NoQueue Health assistant. I can help you navigate the platform — booking agents, using the AI intake, managing messages, and more. What would you like to know?",
            created_at: new Date().toISOString(),
          }]);
        }
        if (tid) setThreadId(tid);
        setHistoryLoaded(true);
      })
      .catch(() => {
        // Not signed in or network error — show welcome without history
        setMessages([{
          id:         "welcome",
          role:       "assistant",
          content:    "Hi! I'm the NoQueue Health assistant. Sign in to save your conversation history. How can I help you navigate the platform?",
          created_at: new Date().toISOString(),
        }]);
        setHistoryLoaded(true);
      });
  }, [open, historyLoaded]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: LocalMessage = {
      id:         crypto.randomUUID(),
      role:       "user",
      content:    text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res  = await fetch("/api/site-assistant", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: text, threadId }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json?.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id:         json.messageId ?? crypto.randomUUID(),
          role:       "assistant",
          content:    json.reply,
          created_at: new Date().toISOString(),
        },
      ]);
      if (json.threadId) setThreadId(json.threadId);
    } catch {
      setError("Network error — please check your connection.");
    }

    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [input, loading, threadId]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <>
      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-20 right-4 z-50 flex w-[min(350px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/80 shadow-2xl shadow-black/10 backdrop-blur-md"
            style={{ height: "440px" }}
            role="dialog"
            aria-label="NoQueue Health site assistant"
            aria-modal="false"
          >
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-white/40 bg-white/60 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">NoQueue Assistant</p>
                <p className="text-[10px] text-muted-foreground">Platform help only</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/60 hover:text-foreground"
                aria-label="Close assistant"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 p-4">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.12 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-white/80 text-foreground shadow-sm"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary/60">
                        Assistant
                      </p>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </motion.div>
              ))}

              {/* Typing indicator */}
              <AnimatePresence>
                {loading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex justify-start"
                  >
                    <div className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={bottomRef} />
            </div>

            {/* Error */}
            {error && (
              <p className="px-4 pb-1 text-xs text-destructive" role="alert">{error}</p>
            )}

            {/* Input */}
            <div className="border-t border-white/40 p-3">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask about the platform…"
                  aria-label="Ask the site assistant"
                  disabled={loading}
                  className="flex-1 rounded-xl border border-input bg-white/60 px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 placeholder:text-muted-foreground disabled:opacity-50"
                />
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={sendMessage}
                  disabled={!input.trim() || loading}
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating trigger button */}
      <motion.button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-shadow hover:shadow-xl hover:shadow-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={open ? "Close site assistant" : "Open site assistant"}
        whileTap={{ scale: 0.93 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0,   opacity: 1 }}
              exit={{ rotate: 90,    opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </motion.span>
          ) : (
            <motion.span
              key="open"
              initial={{ rotate: 90,  opacity: 0 }}
              animate={{ rotate: 0,   opacity: 1 }}
              exit={{ rotate: -90,   opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Bot className="h-6 w-6" aria-hidden="true" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}
