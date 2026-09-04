import Link from "next/link";

import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";

// Friendly 404 - keeps the calm, glassy tone (spec 5) even on errors.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <GlassCard className="w-full max-w-md p-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          The page you are looking for does not exist or has expired.
        </p>
        <Button asChild size="lg" className="mt-6 w-full">
          <Link href="/">Back to the start</Link>
        </Button>
      </GlassCard>
    </main>
  );
}
