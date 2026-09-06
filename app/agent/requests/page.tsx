"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  IndianRupee,
  User,
  XCircle,
  Ban,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────────────────────

type BookingStatus = "pending" | "accepted" | "completed" | "cancelled" | "declined";

interface Booking {
  id: string;
  status: BookingStatus;
  created_at: string;
  agent_posts: { title: string; price: number } | null;
  patient: { full_name: string | null; avatar_url: string | null } | null;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending:   { label: "Pending",   color: "text-amber-700 bg-amber-50 border-amber-200",  icon: Clock         },
  accepted:  { label: "Accepted",  color: "text-teal-700 bg-teal-50 border-teal-200",     icon: CheckCircle2  },
  completed: { label: "Completed", color: "text-green-700 bg-green-50 border-green-200",  icon: CalendarCheck },
  cancelled: { label: "Cancelled", color: "text-slate-500 bg-slate-50 border-slate-200",  icon: XCircle       },
  declined:  { label: "Declined",  color: "text-rose-600 bg-rose-50 border-rose-200",     icon: Ban           },
};

const STATUS_ORDER: BookingStatus[] = [
  "pending", "accepted", "completed", "cancelled", "declined",
];

// ─── Inline toast ─────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
        type === "success" ? "bg-teal-600 text-white" : "bg-destructive text-destructive-foreground"
      }`}
      role="status"
      aria-live="polite"
    >
      {message}
    </motion.div>
  );
}

// ─── Booking card ─────────────────────────────────────────────────────────────

function BookingCard({
  booking,
  onStatusChange,
  onError,
}: {
  booking: Booking;
  onStatusChange: (id: string, status: BookingStatus) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy]           = useState<BookingStatus | null>(null);
  const cfg = STATUS_CONFIG[booking.status];
  const Icon = cfg.icon;

  const update = async (newStatus: BookingStatus) => {
    setBusy(newStatus);
    try {
      const res  = await fetch(`/api/bookings/${booking.id}/status`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      // Optimistic: move card to new section immediately
      onStatusChange(booking.id, newStatus);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  return (
    <GlassCard className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* Patient info */}
        <div className="flex items-center gap-3">
          {booking.patient?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={booking.patient.avatar_url}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
          <div>
            <p className="font-medium">{booking.patient?.full_name ?? "Patient"}</p>
            <p className="text-sm text-muted-foreground">
              {booking.agent_posts?.title ?? "Service"}
            </p>
          </div>
        </div>

        {/* Price + status badge */}
        <div className="flex items-center gap-3">
          {booking.agent_posts?.price != null && (
            <span className="flex items-center gap-0.5 text-sm font-semibold text-teal-700">
              <IndianRupee className="h-3.5 w-3.5" aria-hidden="true" />
              {booking.agent_posts.price.toLocaleString("en-IN")}
            </span>
          )}
          <span
            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${cfg.color}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Actions */}
      <AnimatePresence>
        {booking.status === "pending" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 flex gap-2"
          >
            <Button
              size="sm"
              onClick={() => update("accepted")}
              disabled={busy !== null}
              className="gap-1"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {busy === "accepted" ? "Accepting…" : "Accept"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => update("declined")}
              disabled={busy !== null}
              className="gap-1 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <Ban className="h-4 w-4" aria-hidden="true" />
              {busy === "declined" ? "Declining…" : "Decline"}
            </Button>
          </motion.div>
        )}

        {booking.status === "accepted" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 flex gap-2"
          >
            <Button
              size="sm"
              onClick={() => update("completed")}
              disabled={busy !== null}
              className="gap-1 bg-green-600 hover:bg-green-700"
            >
              <CalendarCheck className="h-4 w-4" aria-hidden="true" />
              {busy === "completed" ? "Completing…" : "Mark completed"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => update("cancelled")}
              disabled={busy !== null}
              className="gap-1 text-muted-foreground"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              {busy === "cancelled" ? "Cancelling…" : "Cancel"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-3 text-xs text-muted-foreground">
        Booked{" "}
        {new Date(booking.created_at).toLocaleDateString("en-IN", {
          day: "numeric", month: "short", year: "numeric",
        })}
      </p>
    </GlassCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentRequestsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setFetchError("Session expired — please sign in again.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("bookings")
        .select(
          `id, status, created_at,
           agent_posts(title, price),
           patient:profiles!bookings_patient_id_fkey(full_name, avatar_url)`
        )
        .eq("agent_id", user.id)
        .order("created_at", { ascending: false });

      if (error) { setFetchError(error.message); setLoading(false); return; }
      setBookings((data ?? []) as unknown as Booking[]);
      setLoading(false);
    });
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  const handleStatusChange = (id: string, status: BookingStatus) => {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status } : b));
    const labels: Record<BookingStatus, string> = {
      accepted:  "Booking accepted.",
      completed: "Booking marked as completed.",
      cancelled: "Booking cancelled.",
      declined:  "Booking declined.",
      pending:   "",
    };
    if (labels[status]) showToast(labels[status], "success");
  };

  const grouped = STATUS_ORDER.reduce(
    (acc, s) => { acc[s] = bookings.filter((b) => b.status === s); return acc; },
    {} as Record<BookingStatus, Booking[]>
  );

  const totalActive = grouped.pending.length + grouped.accepted.length;

  return (
    <div className="space-y-6">
      <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} />}</AnimatePresence>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {loading ? "Loading…" :
            totalActive > 0
              ? `${grouped.pending.length} pending · ${grouped.accepted.length} accepted`
              : "All bookings are up to date."}
        </p>
      </div>

      {/* Error */}
      {fetchError && (
        <GlassCard className="p-4">
          <p className="text-sm text-destructive" role="alert">
            Failed to load bookings: {fetchError}
          </p>
        </GlassCard>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <GlassCard key={i} className="h-28 animate-pulse bg-white/40 p-5" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !fetchError && bookings.length === 0 && (
        <GlassCard className="flex flex-col items-center gap-3 py-12 text-center">
          <CalendarCheck className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground">No booking requests yet.</p>
          <p className="text-sm text-muted-foreground">
            Requests will appear here once patients book your services.
          </p>
        </GlassCard>
      )}

      {/* Grouped sections */}
      {!loading && !fetchError &&
        STATUS_ORDER.map((status) => {
          const group = grouped[status];
          if (group.length === 0) return null;
          const cfg = STATUS_CONFIG[status];
          const isTerminal = status === "completed" || status === "cancelled" || status === "declined";

          return (
            <motion.section
              key={status}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={isTerminal ? "opacity-80" : ""}
            >
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <span className={`rounded-full border px-2 py-0.5 text-xs ${cfg.color}`}>
                  {cfg.label}
                </span>
                <span className="text-muted-foreground/50">{group.length}</span>
              </h2>
              <div className="space-y-3">
                {group.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    onStatusChange={handleStatusChange}
                    onError={(msg) => showToast(msg, "error")}
                  />
                ))}
              </div>
            </motion.section>
          );
        })}
    </div>
  );
}
