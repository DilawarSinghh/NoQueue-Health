"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Ban,
  CalendarCheck,
  CheckCircle2,
  Clock,
  IndianRupee,
  Star,
  User,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";

// ─── Types ───────────────────────────────────────────────────────────────────

type BookingStatus = "pending" | "accepted" | "completed" | "cancelled" | "declined";

interface Booking {
  id: string;
  status: BookingStatus;
  created_at: string;
  agent_posts: { title: string; price: number } | null;
  agent: { full_name: string | null; avatar_url: string | null } | null;
  // Joined from booking_ratings (null if not yet rated)
  booking_ratings: { stars: number } | null;
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

// ─── Star display ─────────────────────────────────────────────────────────────

function StarDisplay({ stars }: { stars: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${stars} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
          }`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

// ─── Booking card ─────────────────────────────────────────────────────────────

function BookingCard({
  booking,
  onRateClick,
}: {
  booking: Booking;
  onRateClick: (booking: Booking) => void;
}) {
  const cfg  = STATUS_CONFIG[booking.status];
  const Icon = cfg.icon;
  const canRate =
    booking.status === "completed" && !booking.booking_ratings;

  return (
    <GlassCard className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* Agent info */}
        <div className="flex items-center gap-3">
          {booking.agent?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={booking.agent.avatar_url}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
          <div>
            <p className="font-medium">{booking.agent?.full_name ?? "Agent"}</p>
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

      {/* Rating display or CTA */}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Booked{" "}
          {new Date(booking.created_at).toLocaleDateString("en-IN", {
            day: "numeric", month: "short", year: "numeric",
          })}
        </p>
        {booking.booking_ratings ? (
          <div className="flex items-center gap-1.5">
            <StarDisplay stars={booking.booking_ratings.stars} />
            <span className="text-xs text-muted-foreground">Your rating</span>
          </div>
        ) : canRate ? (
          <button
            onClick={() => onRateClick(booking)}
            className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
          >
            <Star className="h-3.5 w-3.5" aria-hidden="true" />
            Rate this agent
          </button>
        ) : null}
      </div>
    </GlassCard>
  );
}

// ─── Rate modal ───────────────────────────────────────────────────────────────

function RateModal({
  booking,
  onClose,
  onRated,
}: {
  booking: Booking;
  onClose: () => void;
  onRated: (bookingId: string, stars: number) => void;
}) {
  const [stars, setStars]           = useState(0);
  const [hover, setHover]           = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const handleSubmit = async () => {
    if (stars === 0) { setError("Please select a star rating."); return; }
    setSubmitting(true);
    setError(null);

    const res  = await fetch("/api/ratings", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        bookingId:  booking.id,
        stars,
        reviewText: reviewText.trim() || undefined,
      }),
    });
    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? "Failed to submit rating.");
      setSubmitting(false);
      return;
    }

    onRated(booking.id, stars);
    onClose();
  };

  const displayed = hover || stars;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Rate this agent"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        className="w-full max-w-md"
      >
        <GlassCard className="m-4 p-6">
          <h2 className="text-lg font-semibold">Rate this agent</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {booking.agent?.full_name ?? "Agent"} · {booking.agent_posts?.title ?? "Service"}
          </p>

          {/* Star selector */}
          <div className="mt-5 flex justify-center gap-2" role="group" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStars(s)}
                onMouseEnter={() => setHover(s)}
                onMouseLeave={() => setHover(0)}
                aria-label={`${s} star${s !== 1 ? "s" : ""}`}
                className="transition-transform hover:scale-110 focus:outline-none focus-visible:scale-110"
              >
                <Star
                  className={`h-9 w-9 transition-colors ${
                    s <= displayed
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/30"
                  }`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
          {stars > 0 && (
            <p className="mt-2 text-center text-sm font-medium text-amber-600">
              {["", "Poor", "Fair", "Good", "Very good", "Excellent"][stars]}
            </p>
          )}

          {/* Review text */}
          <div className="mt-4 grid gap-2">
            <label htmlFor="review" className="text-sm font-medium">
              Review <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="review"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value.slice(0, 500))}
              placeholder="Share your experience…"
              rows={3}
              className="w-full resize-none rounded-xl border border-input bg-white/60 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
            <p className="text-right text-xs text-muted-foreground">
              {reviewText.length}/500
            </p>
          </div>

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          <div className="mt-4 flex gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="flex-1 rounded-xl border border-input py-2.5 text-sm font-medium text-muted-foreground hover:bg-white/60"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || stars === 0}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit rating"}
            </button>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PatientBookingsPage() {
  const [bookings, setBookings]     = useState<Booking[]>([]);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rateTarget, setRateTarget] = useState<Booking | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setFetchError("Session expired."); setLoading(false); return; }

      const { data, error } = await supabase
        .from("bookings")
        .select(
          `id, status, created_at,
           agent_posts(title, price),
           agent:profiles!bookings_agent_id_fkey(full_name, avatar_url),
           booking_ratings(stars)`
        )
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false });

      if (error) { setFetchError(error.message); setLoading(false); return; }

      // Normalise booking_ratings — Supabase returns [] or [{stars}]
      const normalised = (data ?? []).map((b: unknown) => {
        const raw = b as Record<string, unknown>;
        const ratingsRaw = raw.booking_ratings;
        const rating = Array.isArray(ratingsRaw)
          ? (ratingsRaw[0] ?? null)
          : ratingsRaw ?? null;
        return { ...raw, booking_ratings: rating } as unknown as Booking;
      });

      setBookings(normalised);
      setLoading(false);
    });
  }, []);

  const handleRated = (bookingId: string, stars: number) => {
    setBookings((prev) =>
      prev.map((b) =>
        b.id === bookingId ? { ...b, booking_ratings: { stars } } : b
      )
    );
  };

  const grouped = STATUS_ORDER.reduce(
    (acc, s) => { acc[s] = bookings.filter((b) => b.status === s); return acc; },
    {} as Record<BookingStatus, Booking[]>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Bookings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {loading ? "Loading…" : `${bookings.length} booking${bookings.length !== 1 ? "s" : ""} total`}
        </p>
      </div>

      {fetchError && (
        <GlassCard className="p-4">
          <p className="text-sm text-destructive" role="alert">{fetchError}</p>
        </GlassCard>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <GlassCard key={i} className="h-28 animate-pulse bg-white/40 p-5" />
          ))}
        </div>
      )}

      {!loading && !fetchError && bookings.length === 0 && (
        <GlassCard className="flex flex-col items-center gap-3 py-12 text-center">
          <CalendarCheck className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground">No bookings yet.</p>
          <p className="text-sm text-muted-foreground">
            Browse agents and book a service to get started.
          </p>
        </GlassCard>
      )}

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
              className={isTerminal && status !== "completed" ? "opacity-75" : ""}
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
                    onRateClick={setRateTarget}
                  />
                ))}
              </div>
            </motion.section>
          );
        })}

      {/* Rate modal */}
      {rateTarget && (
        <RateModal
          booking={rateTarget}
          onClose={() => setRateTarget(null)}
          onRated={handleRated}
        />
      )}
    </div>
  );
}
