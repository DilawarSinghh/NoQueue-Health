"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  FileText,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";

const steps = [
  { icon: MessageSquareText, title: "Describe your issue", text: "Tell us what you need — discharge summary, insurance forms, or a full intake." },
  { icon: Users, title: "Get matched", text: "Connect with a vetted documentation agent, or let our AI Agent guide you." },
  { icon: FileText, title: "Done", text: "Review, confirm, and your documentation is ready — often in minutes." },
];

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.role) {
        router.replace(data.role === "agent" ? "/agent/dashboard" : "/patient/dashboard");
      } else {
        router.replace("/onboarding/role");
      }
    });
  }, [router]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-white/40 bg-white/60 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <GoogleAuthButton label="Sign In" variant="ghost" />
            <GoogleAuthButton label="Sign Up" />
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-12 pt-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" aria-hidden="true" /> Hospital documentation, made simple
          </span>
          <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Hospital paperwork, handled for you.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Scriba connects patients with experienced documentation agents — or use
            our AI Agent to complete your hospital intake in minutes.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <GoogleAuthButton label="Get started" size="lg" className="w-full sm:w-auto" />
            <Button
              variant="outline"
              size="lg"
              onClick={() => document.getElementById("agents")?.scrollIntoView({ behavior: "smooth" })}
            >
              I&apos;m an agent <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </motion.div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          How it works
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <GlassCard key={s.title} className="p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <s.icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-medium text-muted-foreground">Step {i + 1}</p>
              <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-muted-foreground">{s.text}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      <section id="agents" className="mx-auto max-w-5xl px-4 py-12">
        <div className="grid gap-4 md:grid-cols-2">
          <GlassCard className="p-6 sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Stethoscope className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-xl font-semibold">Earn by helping families</h3>
            <p className="mt-2 text-muted-foreground">
              Are you familiar with hospital paperwork? List your documentation
              services, get booked by patients, and get paid for your expertise.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>• List your services and set your own price</li>
              <li>• Receive booking requests from patients</li>
              <li>• Chat with patients over WhatsApp or DMs</li>
            </ul>
            <GoogleAuthButton label="Become an agent" className="mt-6 w-full" />
          </GlassCard>

          <GlassCard className="p-6 sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-xl font-semibold">Get documentation help, fast</h3>
            <p className="mt-2 text-muted-foreground">
              Skip the confusing paperwork. Describe what you need and get matched
              with a real agent — or use our AI Agent to prepare a doctor-ready
              intake summary.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>• Browse vetted agents by hospital &amp; department</li>
              <li>• AI intake that never re-asks your basics</li>
              <li>• Review everything before it&apos;s sent</li>
            </ul>
            <GoogleAuthButton label="Get help now" className="mt-6 w-full" />
          </GlassCard>
        </div>
      </section>

      <footer className="border-t border-white/40 py-8 text-center text-sm text-muted-foreground">
        Scriba — hospital documentation, made simple.
      </footer>
    </div>
  );
}

