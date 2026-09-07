"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BriefcaseMedical,
  CalendarCheck,
  MessageSquare,
  Star,
  TrendingUp,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";

interface Stats {
  activePosts: number;
  pendingBookings: number;
  unreadMessages: number;
  rating: number;
  ratingCount: number;
}

interface Profile {
  full_name: string | null;
  avatar_url: string | null;
  agent_profiles: {
    department: string | null;
    experience_years: number | null;
    rating: number;
    rating_count: number;
  } | null;
}

const STAT_CARDS = [
  {
    key: "activePosts" as const,
    label: "Active posts",
    icon: BriefcaseMedical,
    href: "/agent/agents",
    color: "text-teal-600 bg-teal-50",
  },
  {
    key: "pendingBookings" as const,
    label: "Pending bookings",
    icon: CalendarCheck,
    href: "/agent/requests",
    color: "text-amber-600 bg-amber-50",
  },
  {
    key: "unreadMessages" as const,
    label: "Unread messages",
    icon: MessageSquare,
    href: "/agent/messages",
    color: "text-blue-600 bg-blue-50",
  },
];

export default function AgentDashboardPage() {
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [stats, setStats]       = useState<Stats>({ activePosts: 0, pendingBookings: 0, unreadMessages: 0, rating: 0, ratingCount: 0 });
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Profile + agent details
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, agent_profiles(department, experience_years, rating, rating_count)")
        .eq("id", user.id)
        .maybeSingle();

      if (prof) {
        const raw = prof as { full_name: string | null; avatar_url: string | null; agent_profiles: Profile["agent_profiles"] | Profile["agent_profiles"][] };
        setProfile({
          full_name: raw.full_name,
          avatar_url: raw.avatar_url,
          agent_profiles: Array.isArray(raw.agent_profiles)
            ? (raw.agent_profiles[0] ?? null)
            : raw.agent_profiles,
        });
      }

      // Stats in parallel
      const [postsRes, bookingsRes] = await Promise.all([
        supabase
          .from("agent_posts")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", user.id)
          .eq("active", true),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", user.id)
          .eq("status", "pending"),
      ]);

      // Unread: threads the agent is in, then count messages they didn't send
      const { data: threads } = await supabase
        .from("threads")
        .select("id")
        .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
        .eq("type", "agent_patient");

      let unread = 0;
      if (threads && threads.length > 0) {
        const threadIds = threads.map((t) => t.id);
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .in("thread_id", threadIds)
          .neq("sender_id", user.id)
          .eq("is_assistant", false);
        unread = count ?? 0;
      }

      const ap = prof as Profile | null;
      setStats({
        activePosts:     postsRes.count   ?? 0,
        pendingBookings: bookingsRes.count ?? 0,
        unreadMessages:  unread,
        rating:          ap?.agent_profiles?.rating      ?? 0,
        ratingCount:     ap?.agent_profiles?.rating_count ?? 0,
      });
      } catch (e: unknown) {
        setLoadError(e instanceof Error ? e.message : "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const displayName = profile?.full_name ?? "Agent";
  const ap = profile?.agent_profiles;

  if (loadError) {
    return (
      <div className="space-y-4 pt-4">
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
              {loading ? "Loading…" : `Welcome, ${displayName}`}
            </h1>
            {ap && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {ap.department ?? ""}
                {ap.experience_years != null && `${ap.department ? " · " : ""}${ap.experience_years} yr${ap.experience_years !== 1 ? "s" : ""} exp`}
              </p>
            )}
          </div>

          {stats.ratingCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-amber-700">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="font-semibold">{stats.rating.toFixed(1)}</span>
              <span className="text-xs text-amber-500">({stats.ratingCount})</span>
            </div>
          )}
        </GlassCard>
      </motion.div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        {STAT_CARDS.map(({ key, label, icon: Icon, href, color }, i) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
          >
            <Link href={href}>
              <GlassCard className="group flex items-center gap-4 p-5 transition-shadow hover:shadow-xl">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">
                    {loading ? "—" : stats[key]}
                  </p>
                  <p className="text-sm text-muted-foreground">{label}</p>
                </div>
                <TrendingUp className="ml-auto h-4 w-4 text-muted-foreground/40 transition-opacity group-hover:opacity-100 opacity-0" aria-hidden="true" />
              </GlassCard>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.18 }}
      >
        <GlassCard className="p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Quick actions
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/agent/agents"
              className="flex items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <BriefcaseMedical className="h-5 w-5 shrink-0" aria-hidden="true" />
              Create a new post
            </Link>
            <Link
              href="/agent/agents?tab=requests"
              className="flex items-center gap-3 rounded-xl border border-dashed border-teal-400/40 bg-teal-50/60 p-4 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-100/60"
            >
              <CalendarCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
              Browse patient requests
            </Link>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
