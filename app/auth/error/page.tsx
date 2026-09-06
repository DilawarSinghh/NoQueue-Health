import Link from "next/link";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";

// Shown when the OAuth callback fails — ensures users never dead-end
// on a raw Vercel error page after a failed sign-in attempt.
export default function AuthErrorPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <GlassCard className="w-full max-w-md p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign-in failed</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Something went wrong during sign-in. The link may have expired or
          already been used. Please try again.
        </p>
        <Button asChild size="lg" className="mt-6 w-full">
          <Link href="/">Try again</Link>
        </Button>
      </GlassCard>
    </main>
  );
}
