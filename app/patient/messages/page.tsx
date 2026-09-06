"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { ChatThread } from "@/components/ChatThread";

interface ThreadSummary {
  id: string;
  participant_a: string;
  participant_b: string;
  created_at: string;
  peer: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  lastMessage: string | null;
  lastAt: string | null;
}

function PatientMessagesInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const threadParam  = searchParams.get("thread");

  const [userId, setUserId]       = useState<string | null>(null);
  const [threads, setThreads]     = useState<ThreadSummary[]>([]);
  const [activeId, setActiveId]   = useState<string | null>(threadParam);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadThreads = useCallback(async (uid: string) => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("threads")
      .select("id, participant_a, participant_b, created_at")
      .eq("type", "agent_patient")
      .or(`participant_a.eq.${uid},participant_b.eq.${uid}`)
      .order("created_at", { ascending: false });

    if (error) { setLoadError(error.message); setLoading(false); return; }
    if (!data || data.length === 0) { setLoading(false); return; }

    // Resolve peer profiles
    const peerIds = data.map((t) =>
      t.participant_a === uid ? t.participant_b : t.participant_a
    );
    const uniquePeerIds = Array.from(new Set(peerIds));

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", uniquePeerIds);

    const profileMap = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p])
    );

    // Last message per thread
    const threadIds = data.map((t) => t.id);
    const { data: lastMsgs } = await supabase
      .from("messages")
      .select("thread_id, content, created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false });

    const lastMap: Record<string, { content: string; created_at: string }> = {};
    for (const m of lastMsgs ?? []) {
      if (!lastMap[m.thread_id]) lastMap[m.thread_id] = m;
    }

    const summaries: ThreadSummary[] = data.map((t) => {
      const peerId = t.participant_a === uid ? t.participant_b : t.participant_a;
      return {
        ...t,
        peer:        profileMap[peerId] ?? null,
        lastMessage: lastMap[t.id]?.content ?? null,
        lastAt:      lastMap[t.id]?.created_at ?? null,
      };
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

  // If a thread was pre-selected (e.g. from "Message" button on agents page),
  // keep it active and ensure it's visible in the list once loaded.
  useEffect(() => {
    if (threadParam) setActiveId(threadParam);
  }, [threadParam]);

  const selectThread = (id: string) => {
    setActiveId(id);
    router.replace(`/patient/messages?thread=${id}`, { scroll: false });
  };

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  return (
    <div className="space-y-4">
      <div>
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

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        {/* Thread list */}
        <GlassCard className="h-[calc(100dvh-220px)] overflow-y-auto p-0">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
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
                    {t.peer?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.peer.avatar_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <User className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {t.peer?.full_name ?? "Agent"}
                      </p>
                      {t.lastMessage && (
                        <p className="truncate text-xs text-muted-foreground">
                          {t.lastMessage}
                        </p>
                      )}
                    </div>
                    {t.lastAt && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {new Date(t.lastAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        {/* Chat panel */}
        <GlassCard className="h-[calc(100dvh-220px)] overflow-hidden p-0">
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
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
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
