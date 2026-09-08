"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarDays,
  Download,
  FileText,
  Loader2,
  Sparkles,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { AI_PROVIDERS, type AIProviderId } from "@/lib/ai/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IntakeRecord {
  id:               string;
  created_at:       string;
  /** Legacy rows: "low"/"high". New rows: provider id ("minimax-m3" | "gemini" | "groq"). */
  tier:             string | null;
  fallback_occurred: boolean | null;
  structured_data:  Record<string, string> | null;
  clinical_summary: string | null;
  pdf_url:          string | null; // storage path, not a signed URL
  recommended_department?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day:   "numeric",
    month: "short",
    year:  "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour:   "2-digit",
    minute: "2-digit",
  });
}

// ─── Record card ──────────────────────────────────────────────────────────────

function RecordCard({ record }: { record: IntakeRecord }) {
  const [expanded,   setExpanded]   = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError,   setPdfError]   = useState<string | null>(null);

  const chiefComplaint =
    record.structured_data?.chiefComplaint ?? "No complaint recorded";
  const department =
    record.structured_data?.doctorOrDepartment ??
    record.recommended_department ??
    null;

  const tier = record.tier ?? "low";
  const fellBack = !!record.fallback_occurred;

  const fetchSignedUrl = async () => {
    if (!record.pdf_url) { setPdfError("No PDF available for this record."); return; }
    setPdfLoading(true);
    setPdfError(null);
    try {
      const supabase = createClient();
      // Always generate a fresh signed URL — never cache, since it expires after 1 hour
      const { data, error } = await supabase.storage
        .from("patient-pdfs")
        .createSignedUrl(record.pdf_url, 3600); // 1-hour signed URL
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      setPdfError(e instanceof Error ? e.message : "Failed to load PDF.");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <GlassCard className="p-5">
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Date */}
            <span className="flex items-center gap-1 text-sm font-medium">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {formatDate(record.created_at)}
            </span>
            <span className="text-xs text-muted-foreground">{formatTime(record.created_at)}</span>
          </div>

          {/* Chief complaint */}
          <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
            {chiefComplaint}
          </p>

          {/* Tags row */}
          <div className="mt-2 flex flex-wrap gap-2">
            {/* Model badge */}
            <span
              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                tier && AI_PROVIDERS.some((p) => p.id === tier)
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : tier === "groq"
                    ? "border-teal-200 bg-teal-50 text-teal-700"
                    : "border-muted bg-muted/30 text-muted-foreground"
              }`}
            >
              {tier === "groq" ? <Zap className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              {AI_PROVIDERS.find((p) => p.id === tier)?.name ?? "AI"}
            </span>

            {/* Fallback badge */}
            {fellBack && (
              <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                <TriangleAlert className="h-3 w-3" />
                Fallback occurred
              </span>
            )}

            {/* Department */}
            {department && (
              <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
                {department}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchSignedUrl}
            disabled={pdfLoading || !record.pdf_url}
            className="gap-1.5"
            title={record.pdf_url ? "Download PDF report" : "No PDF available"}
          >
            {pdfLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            PDF
          </Button>
          {record.clinical_summary && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded((o) => !o)}
              className="gap-1.5"
            >
              <FileText className="h-4 w-4" />
              {expanded ? "Hide" : "Summary"}
            </Button>
          )}
        </div>
      </div>

      {/* PDF error */}
      {pdfError && (
        <p className="mt-2 text-xs text-destructive" role="alert">{pdfError}</p>
      )}

      {/* Expandable clinical summary */}
      {expanded && record.clinical_summary && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-4 overflow-hidden"
        >
          <div className="rounded-xl border border-white/40 bg-white/40 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Clinical Summary
            </p>
            <p className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
              {record.clinical_summary}
            </p>
          </div>
        </motion.div>
      )}
    </GlassCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntakeHistoryPage() {
  const router = useRouter();
  const [records,  setRecords]  = useState<IntakeRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/"); return; }

      // RLS: intake_records is patient-owner-only — regular client is correct here,
      // NOT service role. Only this patient's own rows will be returned.
      const { data, error: dbErr } = await supabase
        .from("intake_records")
        .select(
          "id, created_at, tier, fallback_occurred, structured_data, clinical_summary, pdf_url"
        )
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false });

      if (dbErr) { setError(dbErr.message); setLoading(false); return; }
      setRecords((data ?? []) as IntakeRecord[]);
      setLoading(false);
    });
  }, [router]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          aria-label="Back"
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Past Intakes</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your previous AI intake sessions and their reports.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <GlassCard className="p-4">
          <p className="text-sm text-destructive" role="alert">
            Failed to load history: {error}
          </p>
        </GlassCard>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <GlassCard key={i} className="h-28 animate-pulse bg-white/40 p-5" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && records.length === 0 && (
        <GlassCard className="flex flex-col items-center gap-3 py-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/30" aria-hidden="true" />
          <p className="text-muted-foreground">No intake records yet.</p>
          <p className="text-sm text-muted-foreground">
            Complete an AI intake to see your history here.
          </p>
          <Button
            variant="outline"
            className="mt-2"
            onClick={() => router.push("/patient/ai-agent")}
          >
            Start an intake
          </Button>
        </GlassCard>
      )}

      {/* Records */}
      {!loading && !error && records.length > 0 && (
        <div className="space-y-3">
          {records.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: i * 0.04 }}
            >
              <RecordCard record={r} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
