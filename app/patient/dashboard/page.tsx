"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Bot,
  CalendarCheck,
  ChevronRight,
  Stethoscope,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";

type BookingStatus = "pending" | "accepted" | "completed" | "cancelled";

interface Booking {
  id: string;
  status: BookingStatus;
  created_at: string;
  agent_posts: { title: string; price: number } | null;
  agent: { full_name: string | null } | null;
}

interface PatientProfile {
  full_name: string | null;
  avatar_url: string | null;
  patient_profiles: {
    age: number | null;
    gender: string | null;
    blood_group: string | null;
  } | null;
}

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending:   "bg-amber-50 text-amber-700",
  accepted:  "bg-teal-50 text-teal-700",
  completed: "bg-slate-100 text-slate-600",
  cancelled: "bg-rose-50 text-rose-600",
};

const FEATURE_TILES = [
  {
    href:        "/patient/hospital-agents",
    icon:        Stethoscope,
    title:       "Hospital Agents",
    description: "Browse vetted agents by hospital and department. Book help with your paperwork.",
    accent:      "bg-teal-50 text-teal-600",
    border:      "hover:border-teal-200",
  },
  {
    href:        "/patient/ai-agent",
    icon:        Bot,
    title:       "AI Agent",
    description: "Answer a few questions and get a doctor-ready intake summary in minutes.",
    accent:      "bg-primary/10 text-primary",
    border:      "hover:border-primary/30",
  },
];

export default function PatientDashboardPage() {
  const [profile, setProfile]   = useState<PatientProfile | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [profRes, bookRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, avatar_url, patient_profiles(age, gender, blood_group)")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("bookings")
          .select(
            `id, status, created_at,
             agent_posts(title, price),
             agent:profiles!bookings_agent_id_fkey(full_name)`
          )
          .eq("patient_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (profRes.data) {
        const raw = profRes.data as {
          full_name: string | null;
          avatar_url: string | null;
          patient_profiles:
            | { age: number | null; gender: string | null; blood_group: string | null }
            | { age: number | null; gender: string | null; blood_group: string | null }[]
            | null;
        };
        setProfile({
          full_name:  raw.full_name,
          avatar_url: raw.avatar_url,
          patient_profiles: Array.isArray(raw.patient_profiles)
            ? (raw.patient_profiles[0] ?? null)
            : raw.patient_profiles,
        });
      }

      if (bookRes.data) setBookings(bookRes.data as unknown as Booking[]);
      } catch (e: unknown) {
        setLoadError(e instanceof Error ? e.message : "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const pp = profile?.patient_profiles;

  if (loadError) {
    return (
      <div className="pt-4">
        <GlassCard className="p-4">
          <p className="text-sm text-destructive" role="alert">
            Failed to load dashboard: {loadError}
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <GlassCard className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:gap-6">
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-8 w-8" aria-hidden="true" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {loading ? "Loading…" : `Welcome, ${profile?.full_name ?? "there"}`}
            </h1>
            {pp && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {[
                  pp.age    ? `${pp.age} yrs`  : null,
                  pp.gender ?? null,
                  pp.blood_group ? `Blood group: ${pp.blood_group}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>

          <Link
            href="/patient/hospital-agents"
            className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Get help
          </Link>
        </GlassCard>
      </motion.div>

      {/* Feature tiles */}
      <div className="grid gap-4 sm:grid-cols-2">
        {FEATURE_TILES.map(({ href, icon: Icon, title, description, accent, border }, i) => (
          <motion.div
            key={href}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.07 }}
          >
            <Link href={href}>
              <GlassCard
                className={`group flex flex-col gap-4 p-6 transition-all hover:shadow-xl border border-transparent ${border}`}
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${accent}`}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
                <div className="flex items-center gap-1 text-sm font-medium text-primary">
                  Get started
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </GlassCard>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Recent bookings */}
      {!loading && bookings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.18 }}
        >
          <GlassCard className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Recent bookings</h2>
              <Link
                href="/patient/hospital-agents"
                className="text-sm text-primary hover:underline"
              >
                Browse agents
              </Link>
            </div>
            <ul className="space-y-3">
              {bookings.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/40 bg-white/40 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {b.agent_posts?.title ?? "Service"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.agent?.full_name ?? "Agent"} ·{" "}
                      {new Date(b.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                      STATUS_COLORS[b.status]
                    }`}
                  >
                    {b.status}
                  </span>
                </li>
              ))}
            </ul>
          </GlassCard>
        </motion.div>
      )}

      {/* Empty state — no bookings yet */}
      {!loading && bookings.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.18 }}
        >
          <GlassCard className="flex flex-col items-center gap-3 py-10 text-center">
            <CalendarCheck className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground">No bookings yet.</p>
            <p className="text-sm text-muted-foreground">
              Browse agents or use the AI Agent to get started.
            </p>
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
}
