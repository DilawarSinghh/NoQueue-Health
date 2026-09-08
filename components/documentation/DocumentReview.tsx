"use client";

import type { DocumentFormData, DocumentTemplate } from "@/lib/documentation/types";
import { formatFieldValue } from "@/lib/documentation/format";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, FileDown } from "lucide-react";

/**
 * Read-only preview of a completed document before generation. Shows the
 * exact values that will appear in the PDF (including drawn signatures).
 */
export function DocumentReview({
  template,
  data,
  onEdit,
  onGenerate,
  generating,
}: {
  template: DocumentTemplate;
  data: DocumentFormData;
  onEdit: () => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <div className="space-y-5">
      <GlassCard className="p-5">
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">{template.name}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Review the information below, then generate your document.
          </p>
        </div>

        {template.sections.map((section) => (
          <div key={section.id} className="mb-5 last:mb-0">
            <h3 className="mb-3 border-b border-white/50 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h3>
            <dl className="space-y-3">
              {section.fields.map((field) => {
                const raw = data[field.id];
                const isSignatureImage =
                  field.type === "signature" &&
                  typeof raw === "string" &&
                  raw.startsWith("data:image");
                return (
                  <div key={field.id}>
                    <dt className="text-xs text-muted-foreground">{field.label}</dt>
                    <dd className="mt-0.5 break-words text-sm font-medium">
                      {isSignatureImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={raw as string}
                          alt={`${field.label} signature`}
                          className="h-16 rounded border border-white/40 bg-white"
                        />
                      ) : (
                        formatFieldValue(field, raw)
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            className="flex-1 gap-2"
            onClick={onGenerate}
            disabled={generating}
          >
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
            ) : (
              <><FileDown className="h-4 w-4" /> Generate Document</>
            )}
          </Button>
          <Button size="lg" variant="outline" onClick={onEdit} disabled={generating}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
