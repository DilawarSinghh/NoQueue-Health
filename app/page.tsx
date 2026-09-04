"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, ClipboardList } from "lucide-react";

import { ConsentNotice } from "@/components/ConsentNotice";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { CLINIC_NAME } from "@/lib/clinic";

// Landing screen (spec §4): clinic name, consent flow, consent-gated Start.
export default function LandingPage() {
  const router = useRouter();
  const [consented, setConsented] = useState(false);

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <GlassCard className="p-6 sm:p-8">
          {/* Clinic identity — later driven by ?hospital=xyz */}
          <p className="text-sm font-medium uppercase tracking-wide text-primary">
            {CLINIC_NAME}
          </p>

          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ClipboardList className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight">
              Skip the paperwork.
            </h1>
          </div>

          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Answer a few friendly questions and we&apos;ll prepare your
            hospital intake form — you check it, we send it. About 3 minutes.
          </p>

          <div className="my-6 h-px bg-border/60" aria-hidden="true" />

          <ConsentNotice checked={consented} onCheckedChange={setConsented} />

          <Button
            size="lg"
            className="mt-6 w-full"
            disabled={!consented}
            onClick={() => router.push("/intake")}
          >
            Start
            <ArrowRight aria-hidden="true" />
          </Button>

          <p className="mt-3 text-center text-sm text-muted-foreground">
            You&apos;ll review and confirm everything before anything is
            submitted.
          </p>
        </GlassCard>
      </motion.div>
    </main>
  );
}

