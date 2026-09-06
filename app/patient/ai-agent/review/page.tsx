"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIntakeStore } from "@/lib/store";
import {
  INTAKE_FIELD_ORDER,
  INTAKE_FIELD_LABELS,
  REQUIRED_INTAKE_FIELDS,
  isIntakeComplete,
  type IntakeDataPartial,
} from "@/lib/schema";

export default function ReviewPage() {
  const router = useRouter();

  const { data, setData, patientContext, clinicalSummary, setClinicalSummary, pdfUrl, setPdfUrl, reset } =
    useIntakeStore();

  const [userId, setUserId]       = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});

  // Redirect away if no intake data (e.g. direct URL access)
  useEffect(() => {
    if (!isIntakeComplete(data) && !submitted) {
      // Give zustand a tick to rehydrate before redirecting
      const t = setTimeout(() => {
        if (!isIntakeComplete(data)) router.replace("/patient/ai-agent");
      }, 300);
      return () => clearTimeout(t);
    }
  }, [data, submitted, router]);

  // Get current user
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (user) setUserId(user.id);
      });
  }, []);

  const updateField = (key: string, value: string) => {
    setData({ ...data, [key]: value } as IntakeDataPartial);
    if (fieldErrors[key]) {
      setFieldErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
    }
  };

  const validate = (): boolean => {
    const errors: Partial<Record<string, string>> = {};
    for (const key of REQUIRED_INTAKE_FIELDS) {
      const val = data[key];
      if (!val || String(val).trim() === "") {
        errors[key] = "This field is required";
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!userId) { setError("Session expired — please sign in again."); return; }
    if (!isIntakeComplete(data)) { setError("Please fill in all required fields."); return; }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-report", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeData:  data,
          patientName: patientContext?.name ?? "Patient",
          patientId:   userId,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.error ?? "Report generation failed. Please try again.");
        setSubmitting(false);
        return;
      }

      setPdfUrl(json.pdfUrl);
      if (json.clinicalSummary) setClinicalSummary(json.clinicalSummary);
      setSubmitted(true);
    } catch {
      setError("Network error — please check your connection and try again.");
    }

    setSubmitting(false);
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (submitted && pdfUrl) {
    return (
      <div className="mx-auto max-w-xl">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <GlassCard className="flex flex-col items-center gap-5 p-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-teal-600" aria-hidden="true" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Report generated</h1>
              <p className="mt-2 text-muted-foreground">
                Your intake summary has been prepared and sent to the clinic.
              </p>
            </div>

            {clinicalSummary && (
              <div className="w-full rounded-xl border border-white/40 bg-white/40 p-4 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Clinical summary
                </p>
                <p className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
                  {clinicalSummary}
                </p>
              </div>
            )}

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download PDF
              </a>
              <Button
                variant="outline"
                onClick={() => { reset(); router.push("/patient/ai-agent"); }}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Start new intake
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              The PDF download link is valid for 1 hour. Your report has been saved to your account.
            </p>
          </GlassCard>
        </motion.div>
      </div>
    );
  }

  // ── Review + edit screen ──────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Review your intake</h1>
            <p className="text-sm text-muted-foreground">
              Edit anything before generating the report. Required fields are marked *.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Editable fields */}
      <GlassCard className="p-6">
        <h2 className="mb-4 font-semibold">Intake information</h2>
        <div className="grid gap-4">
          {INTAKE_FIELD_ORDER.map((key) => {
            const isRequired = REQUIRED_INTAKE_FIELDS.includes(key as typeof REQUIRED_INTAKE_FIELDS[number]);
            const val        = String(data[key] ?? "");
            const err        = fieldErrors[key];
            const isLong     = val.length > 80 || key === "associatedSymptoms" || key === "priorEpisodes" || key === "medicationsTried";

            return (
              <div key={key} className="grid gap-1.5">
                <Label htmlFor={`field-${key}`}>
                  {INTAKE_FIELD_LABELS[key]}
                  {isRequired && <span className="ml-0.5 text-destructive">*</span>}
                </Label>
                {isLong ? (
                  <Textarea
                    id={`field-${key}`}
                    value={val}
                    onChange={(e) => updateField(key, e.target.value)}
                    rows={2}
                    className={err ? "border-destructive" : ""}
                  />
                ) : (
                  <Input
                    id={`field-${key}`}
                    value={val}
                    onChange={(e) => updateField(key, e.target.value)}
                    className={err ? "border-destructive" : ""}
                  />
                )}
                {err && (
                  <p className="text-xs text-destructive" role="alert">{err}</p>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Pre-filled context summary */}
      {patientContext && (
        <GlassCard className="p-5">
          <h2 className="mb-3 font-semibold">Patient background</h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            {[
              ["Name",             patientContext.name],
              ["Age",              patientContext.age  ? `${patientContext.age} years` : null],
              ["Gender",           patientContext.gender],
              ["Allergies",        patientContext.allergies],
              ["Chronic conditions", patientContext.chronicConditions],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm font-medium">{value}</dd>
                </div>
              ))}
          </dl>
        </GlassCard>
      )}

      {/* Error */}
      {error && (
        <GlassCard className="border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive" role="alert">{error}</p>
        </GlassCard>
      )}

      {/* Submit */}
      <GlassCard className="p-5">
        <p className="mb-4 text-sm text-muted-foreground">
          By confirming, you agree to send this intake summary to the clinic. The
          report will be emailed to your healthcare provider. This is not a
          diagnosis — it is a patient self-report for clinical review.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            className="flex-1 gap-2"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generating report…</>
            ) : (
              <><FileText className="h-4 w-4" /> Confirm &amp; send report</>
            )}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Back
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
