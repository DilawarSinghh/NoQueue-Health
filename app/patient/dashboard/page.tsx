"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { GlassCard } from "@/components/GlassCard";

export default function PatientDashboardPage() {
  const [name, setName] = useState("there");

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (user) {
          const meta = user.user_metadata as Record<string, unknown>;
          if (typeof meta.full_name === "string") setName(meta.full_name);
        }
      });
  }, []);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-white/40 bg-white/60 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Logo />
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 py-8">
        <GlassCard className="p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {name}</h1>
          <p className="mt-2 text-muted-foreground">
            Your patient dashboard is coming in the next phase. You&apos;re signed
            in and your profile is ready.
          </p>
        </GlassCard>
      </main>
    </div>
  );
}
