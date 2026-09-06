"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  IndianRupee,
  MessageSquare,
  Phone,
  Search,
  Star,
  User,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentPost {
  id: string;
  title: string;
  description: string | null;
  price: number;
  department: string | null;
  hospital: string | null;
  created_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  agent_profiles: {
    experience_years: number | null;
    rating: number;
    rating_count: number;
    bio: string | null;
  } | null;
}

interface PatientRequest {
  id: string;
  department: string | null;
  hospital: string | null;
  price_offered: number | null;
  min_rating: number;
  notes: string | null;
  created_at: string;
  active: boolean;
}

// ─── Post a Request modal ─────────────────────────────────────────────────────

function PostRequestModal({ onClose, onPosted }: { onClose: () => void; onPosted: (r: PatientRequest) => void }) {
  const [department, setDepartment]     = useState("");
  const [hospital, setHospital]         = useState("");
  const [priceOffered, setPriceOffered] = useState("");
  const [minRating, setMinRating]       = useState(0);
  const [notes, setNotes]               = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Session expired."); setSubmitting(false); return; }

    const { data, error: err } = await supabase
      .from("patient_requests")
      .insert({
        patient_id:    user.id,
        department:    department.trim() || null,
        hospital:      hospital.trim()   || null,
        price_offered: priceOffered ? Number(priceOffered) : null,
        min_rating:    minRating,
        notes:         notes.trim() || null,
        active:        true,
      })
      .select()
      .single();

    if (err) { setError(err.message); setSubmitting(false); return; }
    onPosted(data as PatientRequest);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Post a request"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-lg"
      >
        <GlassCard className="m-4 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Post a request</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/60"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="req-dept">Department</Label>
                <Input
                  id="req-dept"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Cardiology"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="req-hosp">Hospital</Label>
                <Input
                  id="req-hosp"
                  value={hospital}
                  onChange={(e) => setHospital(e.target.value)}
                  placeholder="e.g. AIIMS Delhi"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="req-price">Price offered (₹, optional)</Label>
              <Input
                id="req-price"
                type="number"
                min={0}
                value={priceOffered}
                onChange={(e) => setPriceOffered(e.target.value)}
                placeholder="e.g. 500"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="req-rating">
                Minimum agent rating: <span className="font-semibold">{minRating > 0 ? `${minRating}+` : "Any"}</span>
              </Label>
              <input
                id="req-rating"
                type="range"
                min={0}
                max={5}
                step={0.5}
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Any</span><span>5.0</span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="req-notes">Notes (optional)</Label>
              <Textarea
                id="req-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe what you need help with…"
                rows={3}
              />
            </div>

            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Posting…" : "Post request"}
              </Button>
            </div>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
}

// ─── Agent post card ──────────────────────────────────────────────────────────

function AgentCard({ post }: { post: AgentPost }) {
  const router  = useRouter();
  const [booking, setBooking]   = useState<"idle" | "loading" | "done" | "exists">("idle");
  const [msgBusy, setMsgBusy]   = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const agentId = post.profiles?.id;
  const ap      = post.agent_profiles;

  const handleMessage = async () => {
    if (!agentId) return;
    setMsgBusy(true);
    setError(null);
    try {
      const res  = await fetch("/api/threads", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ peerId: agentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to open chat");
      router.push(`/patient/messages?thread=${json.threadId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setMsgBusy(false);
    }
  };

  const handleBook = async () => {
    if (!agentId) return;
    setBooking("loading");
    setError(null);
    try {
      const res  = await fetch("/api/bookings", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ postId: post.id, agentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to book");
      setBooking(json.alreadyExists ? "exists" : "done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBooking("idle");
    }
  };

  return (
    <GlassCard className="p-5">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        {post.profiles?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.profiles.avatar_url}
            alt=""
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-6 w-6" aria-hidden="true" />
          </div>
        )}

        {/* Main info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold leading-tight">
                {post.profiles?.full_name ?? "Agent"}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {[post.hospital, post.department].filter(Boolean).join(" · ")}
                {ap?.experience_years != null &&
                  ` · ${ap.experience_years} yr${ap.experience_years !== 1 ? "s" : ""} exp`}
              </p>
            </div>

            {/* Price + rating */}
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="flex items-center gap-0.5 rounded-xl bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700">
                <IndianRupee className="h-3.5 w-3.5" aria-hidden="true" />
                {post.price.toLocaleString("en-IN")}
              </span>
              {ap && ap.rating_count > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-amber-600">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {ap.rating.toFixed(1)}
                  <span className="text-muted-foreground">({ap.rating_count})</span>
                </span>
              )}
            </div>
          </div>

          {/* Post title */}
          <p className="mt-2 text-sm font-medium">{post.title}</p>

          {/* Expandable description / bio */}
          {(post.description || ap?.bio) && (
            <div>
              <button
                onClick={() => setExpanded((o) => !o)}
                className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {expanded ? "Less" : "More info"}
              </button>
              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    {post.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{post.description}</p>
                    )}
                    {ap?.bio && (
                      <p className="mt-1 text-sm text-muted-foreground italic">{ap.bio}</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {/* Message */}
        <Button
          size="sm"
          variant="outline"
          onClick={handleMessage}
          disabled={msgBusy}
          className="gap-1.5"
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          {msgBusy ? "Opening…" : "Message"}
        </Button>

        {/* WhatsApp — only shown after booking to protect agent's number */}
        {booking === "done" || booking === "exists" ? (
          <a
            href={`https://wa.me/${(post as unknown as { whatsapp_number?: string }).whatsapp_number ?? ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            WhatsApp
          </a>
        ) : null}

        {/* Book */}
        {booking === "idle" && (
          <Button size="sm" onClick={handleBook} className="gap-1.5">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Book this agent
          </Button>
        )}
        {booking === "loading" && (
          <Button size="sm" disabled className="gap-1.5">
            Booking…
          </Button>
        )}
        {booking === "done" && (
          <span className="flex items-center gap-1.5 rounded-xl bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700">
            ✓ Booking requested
          </span>
        )}
        {booking === "exists" && (
          <span className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700">
            Already booked
          </span>
        )}
      </div>
    </GlassCard>
  );
}

// ─── Own requests list ────────────────────────────────────────────────────────

function MyRequests({
  requests,
  onCancel,
}: {
  requests: PatientRequest[];
  onCancel: (id: string) => void;
}) {
  const [cancelling, setCancelling] = useState<string | null>(null);

  const cancel = async (id: string) => {
    setCancelling(id);
    const supabase = createClient();
    await supabase.from("patient_requests").update({ active: false }).eq("id", id);
    onCancel(id);
    setCancelling(null);
  };

  if (requests.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Your active requests
      </h2>
      {requests.map((r) => (
        <GlassCard key={r.id} className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {[r.hospital, r.department].filter(Boolean).join(" · ") || "General request"}
            </p>
            <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {r.price_offered != null && (
                <span className="flex items-center gap-0.5">
                  <IndianRupee className="h-3 w-3" />
                  {r.price_offered.toLocaleString("en-IN")} offered
                </span>
              )}
              {r.min_rating > 0 && (
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {r.min_rating}+ rating
                </span>
              )}
              <span>
                {new Date(r.created_at).toLocaleDateString("en-IN", {
                  day: "numeric", month: "short",
                })}
              </span>
            </div>
            {r.notes && (
              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{r.notes}</p>
            )}
          </div>
          <button
            onClick={() => cancel(r.id)}
            disabled={cancelling === r.id}
            className="shrink-0 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
            aria-label="Cancel request"
          >
            {cancelling === r.id ? "Cancelling…" : <X className="h-4 w-4" />}
          </button>
        </GlassCard>
      ))}
    </div>
  );
}

// ─── Inner page (needs useSearchParams) ──────────────────────────────────────

function HospitalAgentsInner() {
  const searchParams = useSearchParams();

  const [posts, setPosts]           = useState<AgentPost[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage]             = useState(1);
  const PAGE_SIZE = 10;

  // Filters
  const [hospital, setHospital]     = useState(searchParams.get("hospital") ?? "");
  const [department, setDepartment] = useState(searchParams.get("department") ?? "");
  const [maxPrice, setMaxPrice]     = useState(searchParams.get("maxPrice") ?? "");
  const [search, setSearch]         = useState("");

  // Modal + own requests
  const [showModal, setShowModal]       = useState(false);
  const [myRequests, setMyRequests]     = useState<PatientRequest[]>([]);
  const [reqLoading, setReqLoading]     = useState(true);

  const fetchPosts = useCallback(async (pageNum = 1) => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ page: String(pageNum), pageSize: String(PAGE_SIZE) });
    if (hospital)   params.set("hospital",   hospital);
    if (department) params.set("department", department);
    if (maxPrice)   params.set("maxPrice",   maxPrice);

    try {
      const res  = await fetch(`/api/agent-posts?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load agents");
      setPosts(json.data as AgentPost[]);
      setTotalCount(json.count ?? 0);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to load agents");
    }
    setLoading(false);
  }, [hospital, department, maxPrice]);

  // Load own active requests
  const requestsLoaded = useRef(false);
  useEffect(() => {
    if (requestsLoaded.current) return;
    requestsLoaded.current = true;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setReqLoading(false); return; }
      const { data } = await supabase
        .from("patient_requests")
        .select("*")
        .eq("patient_id", user.id)
        .eq("active", true)
        .order("created_at", { ascending: false });
      setMyRequests((data ?? []) as PatientRequest[]);
      setReqLoading(false);
    });
  }, []);

  // Fetch posts whenever filters / page change
  useEffect(() => { fetchPosts(page); }, [fetchPosts, page]);

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchPosts(1);
  };

  const clearFilters = () => {
    setHospital(""); setDepartment(""); setMaxPrice(""); setSearch("");
    setPage(1);
    fetchPosts(1);
  };

  // Client-side search filter on top of server results
  const visible = search.trim()
    ? posts.filter((p) =>
        [p.title, p.description, p.hospital, p.department, p.profiles?.full_name]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : posts;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hospital Agents</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Browse verified documentation agents and book help.
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} variant="outline" className="gap-2 shrink-0">
          + Post a request
        </Button>
      </div>

      {/* Filter bar */}
      <GlassCard className="p-4">
        <form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-4">
          <div className="relative sm:col-span-4 md:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents…"
              className="h-11 w-full rounded-xl border border-input bg-white/60 pl-9 pr-4 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>
          <Input
            value={hospital}
            onChange={(e) => setHospital(e.target.value)}
            placeholder="Hospital"
          />
          <Input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="Department"
          />
          <Input
            type="number"
            min={0}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Max price (₹)"
          />
          <div className="flex gap-2 sm:col-span-4 md:col-span-4 justify-end">
            <Button type="submit" size="sm">Apply filters</Button>
            <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>Clear</Button>
          </div>
        </form>
      </GlassCard>

      {/* Results */}
      {loadError && (
        <GlassCard className="p-4">
          <p className="text-sm text-destructive" role="alert">
            {loadError}{" "}
            <button onClick={() => fetchPosts(page)} className="underline">
              Retry
            </button>
          </p>
        </GlassCard>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <GlassCard key={i} className="h-36 animate-pulse bg-white/40 p-5" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <GlassCard className="flex flex-col items-center gap-3 py-12 text-center">
          <User className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground">No agents found for these filters.</p>
          <p className="text-sm text-muted-foreground">
            Try changing your filters, or{" "}
            <button onClick={() => setShowModal(true)} className="text-primary underline">
              post a request
            </button>{" "}
            and let agents come to you.
          </p>
        </GlassCard>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {totalCount} agent{totalCount !== 1 ? "s" : ""} found
            {search && ` · filtered by "${search}"`}
          </p>
          <div className="space-y-3">
            {visible.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
              >
                <AgentCard post={p} />
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Own active requests */}
      {!reqLoading && (
        <MyRequests
          requests={myRequests}
          onCancel={(id) =>
            setMyRequests((prev) => prev.filter((r) => r.id !== id))
          }
        />
      )}

      {/* Post a request modal */}
      <AnimatePresence>
        {showModal && (
          <PostRequestModal
            onClose={() => setShowModal(false)}
            onPosted={(r) => {
              setMyRequests((prev) => [r, ...prev]);
              setShowModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Page export (Suspense wrapper required for useSearchParams) ──────────────

export default function HospitalAgentsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
      <HospitalAgentsInner />
    </Suspense>
  );
}
