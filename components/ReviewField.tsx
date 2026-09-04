"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ReviewField — editable field row for the review screen (spec §4).
// Validation problems render as amber warnings only (spec §5: no harsh
// red-on-white alarm styling), with a clear, friendly helper message.
export function ReviewField({
  label,
  value,
  onChange,
  required = false,
  error,
  inputMode,
  placeholder,
  multiline = false,
  maxLength = 500,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string | null;
  inputMode?: "text" | "numeric" | "tel";
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={`review-${label}`}
        className={cn("text-base", error && "text-amber-700")}
      >
        {label}
        {required && (
          <span
            className="ml-1 font-semibold text-amber-600"
            aria-hidden="true"
          >
            *
          </span>
        )}
      </Label>

      {multiline ? (
        <Textarea
          id={`review-${label}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `error-${label}` : undefined}
          className={cn(
            "min-h-[72px] bg-white/80",
            error && "border-amber-400 focus-visible:ring-amber-300"
          )}
        />
      ) : (
        <Input
          id={`review-${label}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={maxLength}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `error-${label}` : undefined}
          className={cn(
            "bg-white/80",
            error && "border-amber-400 focus-visible:ring-amber-300"
          )}
        />
      )}

      {error && (
        <p id={`error-${label}`} className="text-sm text-amber-700">
          {error}
        </p>
      )}
    </div>
  );
}

