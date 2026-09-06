"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BriefcaseMedical,
  Building2,
  ChevronRight,
  IndianRupee,
  MessageSquare,
  PenLine,
  Plus,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HOSPITAL_NAME } from "@/lib/constants/hospital";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentPost {
  id: string;
  title: string;
  description: string | null;
  price: number;
  department: string | null;
  active: boolean;
  created_at: string;
}

interface PatientRequest {
  id: string;
  department: string | null;
  price_offered: number | null;
  min_rating: number;
  notes: string | null;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}

// ─── Create-post form ─────────────────────────────────────────────────────────

function CreatePostForm({
  defaultDept,
  onCreated,
}: {
  defaultDept: string;
  onCreated: (post: AgentPost) => void;
}) {
  const [open, setOpen]               = useState(false);
  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice]             = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      setError("Please enter a valid price.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Session expired."); setSubmitting(false); return; }

    const { data, error: dbErr } = await supabase
      .from("agent_posts")
      .insert({
        agent_id:    user.id,
        title:       title.trim(),
        description: description.trim() || null,
        price:       Number(price),
        // department is inherited from agent_profiles — stored at insert time via
        // a DB default/trigger, or fetched client-side and stored explicitly below
        department:  defaultDept || null,
      })
      .select()
      .single();

    if (dbErr) { setError(dbErr.message); setSubmitting(false); return; }

    onCreated(data as AgentPost);
    setTitle(""); setDescription(""); setPrice("");
    setOpen(false);
    setSubmitting(false);
  };

  return (
    <div>
      <Button onClick={() => setOpen((o) => !o)} className="gap-2">
        <Plus className="h-4 w-4" aria-hidden="true" />
        {open ? "Cancel" : "Create post"}
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <GlassCard className="mt-4 p-5">
              <h2 className="mb-1 font-semibold">New service post</h2>

              {/* Implicit hospital + department badges */}
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-0.5 text-xs font-medium text-blue-700">
                  <Building2 className="h-3 w-3" aria-hidden="true" />
                  {HOSPITAL_NAME}
                </span>
                {defaultDept && (
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
                    {defaultDept}
                  </span>
                )}
              </div>

              <form onSubmit={handleSubmit} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Discharge summary assistance"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="desc">Description (optional)</Label>
                  <Textarea
                    id="desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What documents you help with, your availability, etc."
                    rows={3}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="price">Price (₹)</Label>
                  <Input
                    id="price"
                    type="number"
                    min={1}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="500"
                    required
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Posting…" : "Post"}
                  </Button>
                </div>
              </form>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onDeactivate,
}: {
  post: AgentPost;
  onDeactivate: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const deactivate = async () => {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("agent_posts").update({ active: false }).eq("id", post.id);
    onDeactivate(post.id);
    setBusy(false);
  };

  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{post.title}</h3>
          {post.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {post.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {post.department && (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {post.department}
              </span>
            )}
            <span className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs text-blue-700">
              <Building2 className="h-3 w-3" aria-hidden="true" />
              {HOSPITAL_NAME}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="flex items-center gap-0.5 rounded-xl bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700">
            <IndianRupee className="h-3.5 w-3.5" aria-hidden="true" />
            {post.price.toLocaleString("en-IN")}
          </span>
          <button
            onClick={deactivate}
            disabled={busy}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
            aria-label="Remove post"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        </div>
      </div>
    </GlassCard>
  );
}

// ─── Patient request card ─────────────────────────────────────────────────────

function RequestCard({ req }: { req: PatientRequest }) {
  const router = useRouter();
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startDm = async () => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Session expired."); setBusy(false); return; }

    const { data: existing } = await supabase
      .from("threads")
      .select("id")
      .eq("type", "agent_patient")
      .or(
        `and(participant_a.eq.${user.id},participant_b.eq.${req.id}),` +
        `and(participant_a.eq.${req.id},participant_b.eq.${user.id})`
      )
      .maybeSingle();

    if (existing) {
      router.push(`/agent/messages?thread=${existing.id}`);
      return;
    }

    const { data: thread, error: threadErr } = await supabase
      .from("threads")
      .insert({
        type:          "agent_patient",
        participant_a: user.id,
        participant_b: req.id,
      })
      .select("id")
      .single();

    if (threadErr) { setError(threadErr.message); setBusy(false); return; }
    router.push(`/agent/messages?thread=${thread.id}`);
  };

  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {req.profiles?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={req.profiles.avatar_url}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                {req.profiles?.full_name?.[0]?.toUpperCase() ?? "P"}
              </div>
            )}
            <span className="font-medium">
              {req.profiles?.full_name ?? "Patient"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {req.department && <span>{req.department}</span>}
            {req.price_offered != null && (
              <span className="flex items-center gap-0.5 font-medium text-teal-700">
                <IndianRupee className="h-3.5 w-3.5" />
                {req.price_offered.toLocaleString("en-IN")} offered
              </span>
            )}
            {req.min_rating > 0 && (
              <span className="flex items-center gap-0.5">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {req.min_rating}+ rating preferred
              </span>
            )}
          </div>
          {req.notes && (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {req.notes}
            </p>
          )}
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
        <Button size="sm" onClick={startDm} disabled={busy} className="shrink-0 gap-1">
          <MessageSquare className="h-4 w-4" />
          Message
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </GlassCard>
  );
}

// ─── Page (inner — needs useSearchParams, must be inside Suspense) ────────────

type Tab = "posts" | "requests";

function AgentAgentsInner() {
  const searchParams = useSearchParams();
  const initialTab   = (searchParams.get("tab") === "requests" ? "requests" : "posts") as Tab;
  const [tab, setTab] = useState<Tab>(initialTab);

  const [posts, setPosts]                     = useState<AgentPost[]>([]);
  const [requests, setRequests]               = useState<PatientRequest[]>([]);
  const [loadingPosts, setLoadingPosts]       = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requestsError, setRequestsError]     = useState<string | null>(null);
  const [defaultDept, setDefaultDept]         = useState("");

  const hasFetchedRequests = useRef(false);

  // Load own posts + department from profile
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;

      const [postsRes, profRes] = await Promise.all([
        supabase
          .from("agent_posts")
          .select("*")
          .eq("agent_id", user.id)
          .eq("active", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("agent_profiles")
          .select("department")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (postsRes.data)  setPosts(postsRes.data as AgentPost[]);
      if (profRes.data)   setDefaultDept(profRes.data.department ?? "");
      setLoadingPosts(false);
    });
  }, []);

  // Load patient requests (lazy — only when tab switches)
  useEffect(() => {
    if (tab !== "requests" || hasFetchedRequests.current) return;
    hasFetchedRequests.current = true;

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoadingRequests(false); return; }

      try {
      const { data, error } = await supabase
        .from("patient_requests")
        .select("id, department, price_offered, min_rating, notes, created_at, patient_id")
        .eq("active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data) { setLoadingRequests(false); return; }

      const ids = Array.from(new Set(data.map((r) => r.patient_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", ids);

      const profileMap = Object.fromEntries(
        (profiles ?? []).map((p) => [p.id, p])
      );

      const enriched = data.map((r) => ({
        ...r,
        profiles: profileMap[r.patient_id] ?? null,
      })) as PatientRequest[];

      setRequests(enriched);
      } catch (e: unknown) {
        setRequestsError(e instanceof Error ? e.message : "Failed to load requests.");
      } finally {
        setLoadingRequests(false);
      }
    });
  }, [tab]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage your service posts and browse patient requests.
          </p>
        </div>
        {tab === "posts" && (
          <CreatePostForm
            defaultDept={defaultDept}
            onCreated={(post) => setPosts((prev) => [post, ...prev])}
          />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-white/40 bg-white/40 p-1 backdrop-blur-sm w-fit">
        {(["posts", "requests"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-white shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "posts" ? (
              <><PenLine className="h-4 w-4" /> My posts</>
            ) : (
              <><Users className="h-4 w-4" /> Patient requests</>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {tab === "posts" ? (
          <motion.div
            key="posts"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {loadingPosts ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : posts.length === 0 ? (
              <GlassCard className="flex flex-col items-center gap-3 py-12 text-center">
                <BriefcaseMedical className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-muted-foreground">
                  You haven&apos;t posted any services yet.
                </p>
                <p className="text-sm text-muted-foreground">
                  Click &ldquo;Create post&rdquo; above to get started.
                </p>
              </GlassCard>
            ) : (
              posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  onDeactivate={(id) =>
                    setPosts((prev) => prev.filter((x) => x.id !== id))
                  }
                />
              ))
            )}
          </motion.div>
        ) : (
          <motion.div
            key="requests"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {loadingRequests ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : requestsError ? (
              <GlassCard className="p-4">
                <p className="text-sm text-destructive" role="alert">
                  Failed to load requests: {requestsError}
                </p>
              </GlassCard>
            ) : requests.length === 0 ? (
              <GlassCard className="flex flex-col items-center gap-3 py-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-muted-foreground">
                  No active patient requests right now.
                </p>
              </GlassCard>
            ) : (
              requests.map((r) => <RequestCard key={r.id} req={r} />)
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AgentAgentsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
      <AgentAgentsInner />
    </Suspense>
  );
}
