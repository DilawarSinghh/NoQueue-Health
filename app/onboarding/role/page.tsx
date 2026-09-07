"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BriefcaseMedical, HeartPulse } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Logo } from "@/components/Logo";

export default function RoleSelectionPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // Redirect already-onboarded users before showing the form.
  // Middleware handles unauthenticated access — this handles the case where
  // someone navigates here directly while already having a profile.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setChecking(false); return; } // middleware already handles this

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role === "agent")   { router.replace("/agent/dashboard");   return; }
      if (profile?.role === "patient") { router.replace("/patient/dashboard"); return; }

      // No profile yet — this is a genuinely new user, show the form
      setChecking(false);
    });
  }, [router]);

  if (checking) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <Logo className="mb-6" />
        <GlassCard className="p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            How will you use Scriba?
          </h1>
          <p className="mt-2 text-muted-foreground">
            Choose one. You can&apos;t change this later.
          </p>

          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={() => router.push("/onboarding/agent")}
              className="flex min-h-[76px] items-center gap-4 rounded-2xl border border-white/40 bg-white/60 p-4 text-left shadow-sm transition hover:bg-white/80"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BriefcaseMedical className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="font-semibold">I&apos;m an Agent</p>
                <p className="text-sm text-muted-foreground">
                  Help families with hospital paperwork and earn.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => router.push("/onboarding/patient")}
              className="flex min-h-[76px] items-center gap-4 rounded-2xl border border-white/40 bg-white/60 p-4 text-left shadow-sm transition hover:bg-white/80"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <HeartPulse className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="font-semibold">I&apos;m a Patient</p>
                <p className="text-sm text-muted-foreground">
                  Get hospital documentation help, fast.
                </p>
              </div>
            </button>
          </div>
        </GlassCard>
      </motion.div>
    </main>
  );
}
