"use client";

/**
 * ChatThread — shared DM chat UI used by both /agent/messages and
 * /patient/messages. Handles:
 *   - Loading message history for a thread
 *   - Sending new messages
 *   - Supabase Realtime subscription for live updates
 *   - Emergency/assistant message styling
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { motion } from "framer-motion";
import { Send } from "lucide-react";
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
  /** Optional display name for the other participant */
  peerName?: string;
}

export function ChatThread({ threadId, currentUserId, peerName }: ChatThreadProps) {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [sending, setSending]     = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load history
  useEffect(() => {
    if (!threadId) return;
    const supabase = createClient();

    supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) { setLoadError(error.message); return; }
        setMessages((data ?? []) as Message[]);
      });

    // Realtime subscription
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => {
            // deduplicate (we optimistically add our own messages)
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
      // Roll back optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setSendError(error.message);
      setInput(text); // restore input
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
      <p className="p-4 text-sm text-destructive" role="alert">
        Failed to load messages: {loadError}
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      {peerName && (
        <div className="border-b border-white/40 px-4 py-3">
          <p className="font-semibold">{peerName}</p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground pt-8">
            No messages yet. Say hello!
          </p>
        )}
        {messages.map((msg) => {
          const isOwn = msg.sender_id === currentUserId;
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
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/40 p-3">
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
