"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Stethoscope,
  User,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/patient/dashboard",       label: "Dashboard",      icon: LayoutDashboard },
  { href: "/patient/hospital-agents", label: "Hospital Agents", icon: Stethoscope    },
  { href: "/patient/ai-agent",        label: "AI Agent",        icon: Bot            },
  { href: "/patient/messages",        label: "Messages",        icon: MessageSquare  },
];

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const router    = useRouter();
  const [name, setName]       = useState("");
  const [avatar, setAvatar]   = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (!user) return;
        const meta = user.user_metadata as Record<string, unknown>;
        if (typeof meta.full_name  === "string") setName(meta.full_name);
        if (typeof meta.avatar_url === "string") setAvatar(meta.avatar_url);
      });
  }, []);

  const signOut = async () => {
    await createClient().auth.signOut();
    router.replace("/");
  };

  return (
    <div className="min-h-dvh">
      {/* Top nav */}
      <header className="sticky top-0 z-20 border-b border-white/40 bg-white/60 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Logo className="shrink-0" />

          {/* Desktop nav */}
          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Patient navigation">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-white/70 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Profile dropdown (desktop) */}
          <div className="relative hidden md:block">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-xl p-2 text-sm transition-colors hover:bg-white/70"
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-4 w-4" />
                </div>
              )}
              <span className="max-w-[120px] truncate font-medium">{name || "Patient"}</span>
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 w-44 rounded-2xl border border-white/40 bg-white/80 shadow-lg backdrop-blur-md"
                >
                  <Link
                    href="/patient/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <User className="h-4 w-4" /> Profile
                  </Link>
                  <button
                    onClick={signOut}
                    className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-destructive"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile: profile + sign-out */}
          <div className="ml-auto flex items-center gap-1 md:hidden">
            <Button variant="ghost" size="icon" asChild aria-label="Profile">
              <Link href="/patient/profile">
                <User className="h-5 w-5" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Mobile bottom nav */}
        <nav className="flex border-t border-white/40 md:hidden" aria-label="Patient navigation">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
