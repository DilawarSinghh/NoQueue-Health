"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  IndianRupee,
  User,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";

type BookingStatus = "pending" | "accepted" | "completed" | "cancelled";

interface Booking {
  id: string;
  status: BookingStatus;
  created_at: string;
  agent_posts: {
    title: string;
    price: number;
  } | null;
  patient: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

const STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending:   { label: "Pending",   color: "text-amber-700 bg-amber-50",  icon: Clock        },
  accepted:  { label: "Accepted",  color: "text-teal-700 bg-teal-50",    icon: CheckCircle2 },
  completed: { label: "Completed", color: "text-slate-700 bg-slate-100", icon: CalendarCheck },
  cancelled: { label: "Cancelled", color: "text-rose-700 bg-rose-50",    icon: XCircle      },
};

const STATUS_ORDER: BookingStatus[] = ["pending", "accepted", "completed", "cancelled"];

function BookingCard({
  booking,
  onStatusChange,
}: {
  booking: Booking;
  onStatusChange: (id: string, status: BookingStatus) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cfg = STATUS_CONFIG[booking.status];
  const Icon = cfg.icon;

  const update = async (newStatus: BookingStatus) => {
    setBusy(true);
    setError(null);
    const { error: err } = await createClient()
      .from("bookings")
      .update({ status: newStatus })
      .eq("id", booking.id);
    if (err) { setError(err.message); setBusy(false); return; }
    onStatusChange(booking.id, newStatus);
    setBusy(false);
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
              <User className="h-5 w-5" />
            </div>
          )}
          <div>
            <p className="font-medium">{booking.patient?.full_name ?? "Patient"}</p>
            <p className="text-sm text-muted-foreground">
              {booking.agent_posts?.title ?? "Service"}
            </p>
          </div>
        </div>

        {/* Price + status */}
        <div className="flex items-center gap-3">
          {booking.agent_posts?.price != null && (
            <span className="flex items-center gap-0.5 text-sm font-semibold text-teal-700">
              <IndianRupee className="h-3.5 w-3.5" />
              {booking.agent_posts.price.toLocaleString("en-IN")}
            </span>
          )}
          <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${cfg.color}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Actions */}
      {booking.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={() => update("accepted")}
            disabled={busy}
            className="gap-1"
          >
            <CheckCircle2 className="h-4 w-4" /> Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => update("cancelled")}
            disabled={busy}
            className="gap-1 text-destructive hover:text-destructive"
          >
            <XCircle className="h-4 w-4" /> Decline
          </Button>
        </div>
      )}

      {booking.status === "accepted" && (
        <div className="mt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => update("completed")}
            disabled={busy}
            className="gap-1"
          >
            <CalendarCheck className="h-4 w-4" /> Mark complete
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Booked {new Date(booking.created_at).toLocaleDateString("en-IN", {
          day: "numeric", month: "short", year: "numeric",
        })}
      </p>
    </GlassCard>
  );
}

export default function AgentRequestsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;

      const { data, error: err } = await supabase
        .from("bookings")
        .select(
          `id, status, created_at,
           agent_posts(title, price),
           patient:profiles!bookings_patient_id_fkey(full_name, avatar_url)`
        )
        .eq("agent_id", user.id)
        .order("created_at", { ascending: false });

      if (err) { setError(err.message); setLoading(false); return; }
      setBookings((data ?? []) as unknown as Booking[]);
      setLoading(false);
    });
  }, []);

  const handleStatusChange = (id: string, status: BookingStatus) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status } : b))
    );
  };

  const grouped = STATUS_ORDER.reduce(
    (acc, s) => {
      acc[s] = bookings.filter((b) => b.status === s);
      return acc;
    },
    {} as Record<BookingStatus, Booking[]>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Booking requests from patients, grouped by status.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {error && (
        <GlassCard className="p-4">
          <p className="text-sm text-destructive" role="alert">
            Failed to load bookings: {error}
          </p>
        </GlassCard>
      )}

      {!loading && !error && bookings.length === 0 && (
        <GlassCard className="flex flex-col items-center gap-3 py-12 text-center">
          <CalendarCheck className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground">No booking requests yet.</p>
          <p className="text-sm text-muted-foreground">
            Requests will appear here once patients book your services.
          </p>
        </GlassCard>
      )}

      {STATUS_ORDER.map((status) => {
        const group = grouped[status];
        if (group.length === 0) return null;
        const cfg = STATUS_CONFIG[status];
        return (
          <motion.section
            key={status}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <span className={`rounded-full px-2 py-0.5 text-xs ${cfg.color}`}>
                {cfg.label}
              </span>
              <span className="text-muted-foreground/60">{group.length}</span>
            </h2>
            <div className="space-y-3">
              {group.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          </motion.section>
        );
      })}
    </div>
  );
}
