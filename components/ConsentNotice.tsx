"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// ConsentNotice — plain-language consent block for the landing screen (§4, §6).
// The checkbox state lives in the parent (landing page) so "Start" stays
// disabled until consent is given.
export function ConsentNotice({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3 text-base leading-relaxed text-foreground/90">
        <p>
          <span className="font-semibold">What we collect:</span> only the
          details on your hospital form — your name, age, contact
          information, reason for your visit, and a few extras like
          medications and insurance.
        </p>
        <p>
          <span className="font-semibold">Why:</span> so our assistant can
          fill in your paperwork for you — no more clipboards and waiting in
          line. You&apos;ll review everything before it&apos;s sent.
        </p>
        <p>
          <span className="font-semibold">How it&apos;s stored:</span>{" "}
          securely, and only shared with the clinic — and only after you
          check your details and confirm. Nothing is emailed or saved until
          you say so.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl bg-white/70 p-4">
        <Checkbox
          id="consent"
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          className="mt-0.5"
          aria-required="true"
        />
        <Label
          htmlFor="consent"
          className="cursor-pointer text-base font-normal leading-relaxed"
        >
          I consent to provide this information
        </Label>
      </div>
    </div>
  );
}

