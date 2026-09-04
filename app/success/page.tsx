"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Download, RotateCcw } from "lucide-react";

import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { CLINIC_NAME } from "@/lib/clinic";
import { useIntakeStore } from "@/lib/store";

// Success / delivery screen (spec §4).
export default function SuccessPage() {
  const router = useRouter();
  const consented = useIntakeStore((s) => s.consented);
  const pdfUrl = useIntakeStore((s) => s.pdfUrl);
  const reset = useIntakeStore((s) => s.reset);

  // No consent → landing. Direct visit without a generated PDF → friendly
  // fallback card with a way back to the start.
  useEffect(() => {
    if (!consented) router.replace("/");
  }, [consented, router]);

  function startAnother() {
    reset(); // clears consent, data, conversation, pdfUrl
    router.push("/");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <GlassCard className="p-6 text-center sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-8 w-8 text-primary" aria-hidden="true" />
          </div>

          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight">
            All done!
          </h1>
          <p className="mt-3 text-base leading-relaxed text-foreground/90">
            Your details have been sent to {CLINIC_NAME}.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Keep a copy for your records, or start a new intake for someone
            else.
          </p>

          {pdfUrl ? (
            <Button asChild size="lg" className="mt-6 w-full">
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                <Download aria-hidden="true" />
                Download your PDF
              </a>
            </Button>
          ) : (
            <p className="mt-6 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              We couldn&apos;t find your download link. If you just completed
              an intake, please check the confirmation email — otherwise start
              again below.
            </p>
          )}

          <Button
            variant="outline"
            size="lg"
            className="mt-3 w-full"
            onClick={startAnother}
          >
            <RotateCcw aria-hidden="true" />
            Start another
          </Button>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            For your privacy, this download link expires after 24 hours.
          </p>
        </GlassCard>
      </motion.div>
    </main>
  );
}

