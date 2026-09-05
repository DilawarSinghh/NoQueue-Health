import { ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <ClipboardList className="h-5 w-5" aria-hidden="true" />
      </div>
      <span className="text-xl font-semibold tracking-tight">Scriba</span>
    </div>
  );
}