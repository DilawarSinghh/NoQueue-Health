"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function notificationMessage(n: Notification): string {
  const p = n.payload;
  if (typeof p.message === "string" && p.message) return p.message;

  // Fallback builders per type
  switch (n.type) {
    case "new_booking":
      return `New booking request for "${p.post_title ?? "your service"}"`;
    case "booking_status_changed":
      return `Booking status updated to ${p.new_status ?? "unknown"}`;
    case "new_rating":
      return `You received a ${p.stars ?? "?"}-star rating`;
    default:
      return "New notification";
  }
}

function notificationIcon(type: string): string {
  switch (type) {
    case "new_booking":            return "📋";
    case "booking_status_changed": return "🔄";
    case "new_rating":             return "⭐";
    default:                       return "🔔";
  }
}

function notificationHref(n: Notification, role: "agent" | "patient"): string {
  switch (n.type) {
    case "new_booking":
    case "booking_status_changed":
      return role === "agent" ? "/agent/requests" : "/patient/bookings";
    case "new_rating":
      return "/agent/profile";
    default:
      return "#";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBell({ role }: { role: "agent" | "patient" }) {
  const router              = useRouter();
  const [open, setOpen]     = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const panelRef            = useRef<HTMLDivElement>(null);
  const userId              = useRef<string | null>(null);

  // ── Load notifications ──────────────────────────────────────────────────
  const loadNotifications = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    userId.current = user.id;

    const { data } = await supabase
      .from("notifications")
      .select("id, type, payload, read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const items = (data ?? []) as Notification[];
    setNotifications(items);
    setUnread(items.filter((n) => !n.read).length);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // ── Realtime subscription ───────────────────────────────────────────────
  useEffect(() => {
    let channelName: string;
    const supabase = createClient();

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      channelName = `notifications:${user.id}`;

      supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event:  "INSERT",
            schema: "public",
            table:  "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const newNotif = payload.new as Notification;
            setNotifications((prev) => [newNotif, ...prev].slice(0, 20));
            setUnread((prev) => prev + 1);
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (channelName) supabase.channel(channelName).unsubscribe();
    };
  }, []);

  // ── Close panel on outside click ────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // ── Mark one as read ────────────────────────────────────────────────────
  const markRead = async (n: Notification) => {
    if (!n.read) {
      const supabase = createClient();
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
      setNotifications((prev) =>
        prev.map((x) => x.id === n.id ? { ...x, read: true } : x)
      );
      setUnread((prev) => Math.max(0, prev - 1));
    }
    const href = notificationHref(n, role);
    setOpen(false);
    if (href !== "#") router.push(href);
  };

  // ── Mark all as read ────────────────────────────────────────────────────
  const markAllRead = async () => {
    if (!userId.current) return;
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId.current)
      .eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/70"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-white/40 bg-white/90 shadow-xl backdrop-blur-md sm:w-96"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-white/40 px-4 py-3">
              <h3 className="text-sm font-semibold">Notifications</h3>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            {/* Notification list */}
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="space-y-1 p-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/40" />
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <BellOff className="h-8 w-8 text-muted-foreground/30" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">You&apos;re all caught up</p>
                </div>
              ) : (
                <ul role="list" className="p-2">
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => markRead(n)}
                        className={`w-full rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/70 ${
                          !n.read ? "bg-primary/5" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 text-lg" aria-hidden="true">
                            {notificationIcon(n.type)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm leading-snug ${
                                !n.read ? "font-semibold text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              {notificationMessage(n)}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {relativeTime(n.created_at)}
                            </p>
                          </div>
                          {!n.read && (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
