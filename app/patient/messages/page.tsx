"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { ChatThread } from "@/components/ChatThread";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ThreadSummary {
  id: string;
  participant_a: string;
  participant_b: string;
  peer: { id: string; full_name: string | null; avatar_url: string | null } | null;
  lastMessage: string | null;
  lastAt: string | null;
  /** True if the most recent message was NOT sent by the current user */
  hasUnread: boolean;
}

// ─── Inner component (requires useSearchParams → inside Suspense) ─────────────

function PatientMessagesInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const threadParam  = searchParams.get("thread");

  const [userId, setUserId]         = useState<string | null>(null);
  const [threads, setThreads]       = useState<ThreadSummary[]>([]);
  const [activeId, setActiveId]     = useState<string | null>(threadParam);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState<string | null>(null);

  // On mobile, show either the list OR the chat — not both stacked
  const showChat = activeId !== null;

  const loadThreads = useCallback(async (uid: string) => {
    const supabase = createClient();

    const { data: threadRows, error } = await supabase
      .from("threads")
      .select("id, participant_a, participant_b")
      .eq("type", "agent_patient")
      .or(`participant_a.eq.${uid},participant_b.eq.${uid}`);

    if (error) { setLoadError(error.message); setLoading(false); return; }
    if (!threadRows || threadRows.length === 0) { setLoading(false); return; }

    // Resolve peer profiles
    const peerIds = threadRows.map((t) =>
      t.participant_a === uid ? t.participant_b : t.participant_a
    );
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", Array.from(new Set(peerIds)));
    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

    // Last message per thread (one query, JS-side deduplicate)
    const threadIds = threadRows.map((t) => t.id);
    const { data: lastMsgs } = await supabase
      .from("messages")
      .select("thread_id, content, created_at, sender_id")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false });

    const lastMap: Record<string, { content: string; created_at: string; sender_id: string | null }> = {};
    for (const m of lastMsgs ?? []) {
      if (!lastMap[m.thread_id]) lastMap[m.thread_id] = m;
    }

    const summaries: ThreadSummary[] = threadRows
      .map((t) => {
        const peerId = t.participant_a === uid ? t.participant_b : t.participant_a;
        const last   = lastMap[t.id] ?? null;
        return {
          id:            t.id,
          participant_a: t.participant_a,
          participant_b: t.participant_b,
          peer:          profileMap[peerId] ?? null,
          lastMessage:   last?.content ?? null,
          lastAt:        last?.created_at ?? null,
          // Unread = last message exists and was NOT sent by us
          hasUnread:     !!last && last.sender_id !== uid,
        };
      })
      // Sort by last message time, newest first; threads with no messages go last
      .sort((a, b) => {
        if (!a.lastAt && !b.lastAt) return 0;
        if (!a.lastAt) return 1;
        if (!b.lastAt) return -1;
        return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
      });

    setThreads(summaries);
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace("/"); return; }
      setUserId(user.id);
      loadThreads(user.id);
    });
  }, [loadThreads, router]);

  // Realtime: update thread list preview when a new message arrives in any thread
  const userIdRef = useRef<string | null>(null);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel  = supabase
      .channel(`messages:patient:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as { thread_id: string; content: string; created_at: string; sender_id: string | null };
          setThreads((prev) => {
            const idx = prev.findIndex((t) => t.id === msg.thread_id);
            if (idx === -1) return prev; // not our thread
            const updated: ThreadSummary = {
              ...prev[idx],
              lastMessage: msg.content,
              lastAt:      msg.created_at,
              hasUnread:   msg.sender_id !== userIdRef.current,
            };
            // Re-sort: bubble updated thread to top
            const rest = prev.filter((_, i) => i !== idx);
            return [updated, ...rest];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Pre-select thread from URL param
  useEffect(() => {
    if (threadParam) setActiveId(threadParam);
  }, [threadParam]);

  const selectThread = (id: string) => {
    setActiveId(id);
    // Clear unread indicator on selection
    setThreads((prev) =>
      prev.map((t) => t.id === id ? { ...t, hasUnread: false } : t)
    );
    router.replace(`/patient/messages?thread=${id}`, { scroll: false });
  };

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  return (
    <div className="flex h-[calc(100dvh-80px)] flex-col gap-4 md:h-auto md:space-y-4">
      <div className={showChat ? "hidden md:block" : ""}>
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Direct messages with your agents.
        </p>
      </div>

      {loadError && (
        <GlassCard className="p-4">
          <p className="text-sm text-destructive" role="alert">
            Failed to load messages: {loadError}
          </p>
        </GlassCard>
      )}

      <div className="flex flex-1 gap-4 md:grid md:grid-cols-[280px_1fr]">
        {/* ── Thread list ─────────────────────────────────────────────── */}
        <GlassCard
          className={`h-full overflow-y-auto p-0 md:h-[calc(100dvh-220px)] ${
            showChat ? "hidden md:block" : "w-full"
          }`}
        >
          {loading ? (
            <div className="space-y-1 p-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/30" />
              ))}
            </div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No conversations yet.</p>
              <p className="text-xs text-muted-foreground">
                Click &ldquo;Message&rdquo; on an agent card to start a chat.
              </p>
            </div>
          ) : (
            <ul role="list" className="divide-y divide-white/30">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => selectThread(t.id)}
                    className={`flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-white/40 ${
                      activeId === t.id ? "bg-white/50" : ""
                    }`}
                  >
                    {/* Avatar */}
                    {t.peer?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.peer.avatar_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <User className="h-5 w-5" aria-hidden="true" />
                      </div>
                    )}

                    {/* Name + preview */}
                    <div className="min-w-0 flex-1">
                      <p className={`truncate ${t.hasUnread ? "font-semibold" : "font-medium"}`}>
                        {t.peer?.full_name ?? "Agent"}
                      </p>
                      {t.lastMessage && (
                        <p className={`truncate text-xs ${t.hasUnread ? "text-foreground" : "text-muted-foreground"}`}>
                          {t.lastMessage}
                        </p>
                      )}
                    </div>

                    {/* Time + unread dot */}
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {t.lastAt && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(t.lastAt).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short",
                          })}
                        </span>
                      )}
                      {t.hasUnread && (
                        <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        {/* ── Chat panel ──────────────────────────────────────────────── */}
        <GlassCard
          className={`overflow-hidden p-0 md:h-[calc(100dvh-220px)] ${
            showChat ? "flex flex-1 flex-col" : "hidden md:block"
          }`}
        >
          <AnimatePresence mode="wait">
            {activeId && userId ? (
              <motion.div
                key={activeId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <ChatThread
                  threadId={activeId}
                  currentUserId={userId}
                  peerName={activeThread?.peer?.full_name ?? "Agent"}
                  peerAvatar={activeThread?.peer?.avatar_url ?? null}
                  onBack={() => {
                    setActiveId(null);
                    router.replace("/patient/messages", { scroll: false });
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="hidden h-full flex-col items-center justify-center gap-3 p-6 text-center md:flex"
              >
                <MessageSquare className="h-12 w-12 text-muted-foreground/20" />
                <p className="text-muted-foreground">
                  Select a conversation to start chatting.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      </div>
    </div>
  );
}

export default function PatientMessagesPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
      <PatientMessagesInner />
    </Suspense>
  );
}
