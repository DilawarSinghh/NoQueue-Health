import { cn } from "@/lib/utils";

// GlassCard — reusable frosted-glass container (spec §5).
// Wraps every major content block: chat window, review form, success card.
export function GlassCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/40 bg-white/60 shadow-lg shadow-black/5 backdrop-blur-md",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
