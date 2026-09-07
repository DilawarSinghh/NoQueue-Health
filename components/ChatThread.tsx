"use client";

/**
 * ChatThread — shared DM chat UI used by both /agent/messages and
 * /patient/messages. Handles:
 *   - Loading message history for a thread
 *   - Sending new messages (optimistic, with rollback on error)
 *   - Supabase Realtime subscription for live updates
 *   - Mobile-friendly header with avatar + back button
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Send, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string | null;
  is_assistant: boolean;
  content: string;
  created_at: string;
}

interface ChatThreadProps {
  threadId: string;
  currentUserId: string;
  /** Display name for the other participant */
  peerName?: string;
  /** Avatar URL for the other participant */
  peerAvatar?: string | null;
  /** Called when the user taps the back arrow on mobile */
  onBack?: () => void;
}

export function ChatThread({
  threadId,
  currentUserId,
  peerName,
  peerAvatar,
  onBack,
}: ChatThreadProps) {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [sending, setSending]     = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load history + subscribe to realtime
  useEffect(() => {
    if (!threadId) return;
    setHistoryLoading(true);
    setMessages([]);
    setLoadError(null);

    const supabase = createClient();

    supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) { setLoadError(error.message); setHistoryLoading(false); return; }
        setMessages((data ?? []) as Message[]);
        setHistoryLoading(false);
      });

    // Realtime — new messages arrive here for the OTHER person's sends
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => {
            // Deduplicate — we already optimistically added our own messages
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);

    const supabase = createClient();
    const tempId   = crypto.randomUUID();
    const optimistic: Message = {
      id:           tempId,
      thread_id:    threadId,
      sender_id:    currentUserId,
      is_assistant: false,
      content:      text,
      created_at:   new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");

    const { error } = await supabase.from("messages").insert({
      thread_id: threadId,
      sender_id: currentUserId,
      content:   text,
    });

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setSendError(error.message);
      setInput(text); // restore so they can retry
    }
    setSending(false);
    inputRef.current?.focus();
  }, [input, sending, threadId, currentUserId]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm text-destructive" role="alert">
          Failed to load messages: {loadError}
        </p>
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header — peer name, avatar, optional back button for mobile */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/40 px-3 py-2.5">
        {onBack && (
          <button
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-white/60 hover:text-foreground md:hidden"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        {peerAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={peerAvatar}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-4 w-4" aria-hidden="true" />
          </div>
        )}
        <p className="font-semibold leading-tight">{peerName ?? "Chat"}</p>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {historyLoading ? (
          <div className="space-y-3 pt-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`h-9 animate-pulse rounded-2xl ${
                    i % 2 === 0 ? "w-40 bg-primary/20" : "w-52 bg-white/60"
                  }`}
                />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <p className="pt-8 text-center text-sm text-muted-foreground">
            No messages yet. Say hello!
          </p>
        ) : (
          messages.map((msg) => {
            const isOwn       = msg.sender_id === currentUserId;
            const isAssistant = msg.is_assistant;

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isAssistant
                      ? "bg-primary/10 text-foreground"
                      : isOwn
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/70 text-foreground shadow-sm"
                  }`}
                >
                  {isAssistant && (
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary/70">
                      Site assistant
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p
                    className={`mt-1 text-[10px] ${
                      isOwn ? "text-primary-foreground/60" : "text-muted-foreground"
                    }`}
                  >
                    {new Date(msg.created_at).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-white/40 p-3">
        {sendError && (
          <p className="mb-2 text-xs text-destructive" role="alert">
            {sendError}
          </p>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            onFocus={() => {
              setTimeout(() => {
                inputRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }, 300);
            }}
            placeholder="Type a message…"
            aria-label="Message input"
            className="flex-1 rounded-xl border border-input bg-white/60 px-4 py-2.5 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 placeholder:text-muted-foreground"
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            aria-label="Send message"
            className="h-11 w-11 shrink-0"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
