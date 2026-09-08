"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { DOCUMENT_TEMPLATES } from "@/lib/documentation/templates";
import {
  getTemplatePrefill,
  type IntakeCaseSource,
  type PatientProfileSource,
  type PrefillSources,
} from "@/lib/documentation/fieldMapping";
import type { DocumentFormData, DocumentTemplate } from "@/lib/documentation/types";
import { DocumentFormRenderer } from "@/components/documentation/DocumentFormRenderer";
import { DocumentReview } from "@/components/documentation/DocumentReview";

type View = "library" | "form" | "review";

export default function DocumentationPage() {
  const router = useRouter();

  const [view, setView] = useState<View>("library");
  const [template, setTemplate] = useState<DocumentTemplate | null>(null);
  const [values, setValues] = useState<DocumentFormData>({});
  const [prefilled, setPrefilled] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<PrefillSources>({});
  const [patientName, setPatientName] = useState("Patient");

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // ── Load patient profile + latest intake case for safe prefill ──────────────
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace("/");
        return;
      }

      try {
        const [{ data: profile }, { data: patientProfile }, { data: records }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("full_name, phone, email")
              .eq("id", user.id)
              .single(),
            supabase
              .from("patient_profiles")
              .select("gender, age, dob, allergies, chronic_conditions")
              .eq("id", user.id)
              .maybeSingle(),
            supabase
              .from("intake_records")
              .select("structured_data, recommended_department")
              .eq("patient_id", user.id)
              .order("created_at", { ascending: false })
              .limit(1),
          ]);

        const profileSource: PatientProfileSource = {
          fullName: profile?.full_name ?? null,
          phone: profile?.phone ?? null,
          email: profile?.email ?? null,
          dob: patientProfile?.dob ?? null,
          age: patientProfile?.age ?? null,
          gender: patientProfile?.gender ?? null,
          allergies: patientProfile?.allergies ?? null,
          chronicConditions: patientProfile?.chronic_conditions ?? null,
        };

        const latest = records?.[0];
        const structured = (latest?.structured_data ?? {}) as Record<string, string>;
        const intakeCaseSource: IntakeCaseSource = {
          chiefComplaint: structured.chiefComplaint ?? null,
          symptomOnset: structured.symptomOnset ?? null,
          symptomDuration: structured.symptomDuration ?? null,
          symptomSeverity: structured.symptomSeverity ?? null,
          associatedSymptoms: structured.associatedSymptoms ?? null,
          priorEpisodes: structured.priorEpisodes ?? null,
          medicationsTried: structured.medicationsTried ?? null,
          doctorOrDepartment: structured.doctorOrDepartment ?? null,
          department: latest?.recommended_department ?? null,
        };

        setSources({ profile: profileSource, intakeCase: intakeCaseSource });
        setPatientName(profile?.full_name ?? "Patient");
      } catch {
        // Prefill is best-effort; the library still works without it.
        setSources({});
      } finally {
        setLoading(false);
      }
    });
  }, [router]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  function openTemplate(t: DocumentTemplate) {
    const pre = getTemplatePrefill(t.id, sources);
    setTemplate(t);
    setValues(pre.values);
    setPrefilled(pre.prefilled);
    setErrors({});
    setGenerated(false);
    setGenError(null);
    setView("form");
    window.scrollTo({ top: 0 });
  }

  function handleChange(id: string, value: string | string[] | boolean) {
    setValues((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function validate(): boolean {
    if (!template) return false;
    const errs: Record<string, string> = {};
    for (const section of template.sections) {
      for (const field of section.fields) {
        if (!field.required) continue;
        const v = values[field.id];
        const empty =
          v === undefined ||
          v === null ||
          v === "" ||
          (Array.isArray(v) && v.length === 0) ||
          (typeof v === "boolean" && !v);
        if (empty) errs[field.id] = `${field.label} is required.`;
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const first = Object.keys(errs)[0];
      document
        .getElementById(`field-${first}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  }

  function goToReview() {
    if (validate()) {
      setGenerated(false);
      setGenError(null);
      setView("review");
      window.scrollTo({ top: 0 });
    }
  }

  async function generate() {
    if (!template) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/documentation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          patientName,
          data: values,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Document generation failed.");
      }
      const link = document.createElement("a");
      link.href = `data:${json.mimeType};base64,${json.pdfBase64}`;
      link.download = json.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setGenerated(true);
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "Document generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <GlassCard className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading documentation…
        </GlassCard>
      </div>
    );
  }

  // ── Form view ───────────────────────────────────────────────────────────────
  if (view === "form" && template) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setView("library")}
            aria-label="Back to templates"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{template.description}</p>
          </div>
        </div>

        <GlassCard className="p-5">
          <DocumentFormRenderer
            template={template}
            values={values}
            prefilled={prefilled}
            errors={errors}
            onChange={handleChange}
          />
        </GlassCard>

        <GlassCard className="flex items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            <span className="text-destructive">*</span> required fields
          </p>
          <Button onClick={goToReview}>
            Review <ChevronRight className="h-4 w-4" />
          </Button>
        </GlassCard>
      </div>
    );
  }

  // ── Review view ─────────────────────────────────────────────────────────────
  if (view === "review" && template) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setView("form")}
            aria-label="Back to form"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Review Document</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Confirm the details before generating the PDF.
            </p>
          </div>
        </div>

        <DocumentReview
          template={template}
          data={values}
          onEdit={() => setView("form")}
          onGenerate={generate}
          generating={generating}
        />

        {generated && (
          <GlassCard className="flex items-center gap-2 border-green-400/30 bg-green-50/60 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-sm font-medium text-green-700">
              Document generated and downloaded.
            </p>
          </GlassCard>
        )}

        {genError && (
          <GlassCard className="border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive" role="alert">
              {genError}
            </p>
          </GlassCard>
        )}
      </div>
    );
  }

  // ── Library view (default) ──────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documentation</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Complete and generate hospital documents digitally.
        </p>
      </div>

      <GlassCard className="flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Fields you already provided during onboarding or AI case-taking are
          prefilled. Anything missing stays blank for you to fill in — nothing is
          invented.
        </p>
      </GlassCard>

      <div className="grid gap-3">
        {DOCUMENT_TEMPLATES.filter((t) => t.active).map((t, i) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: i * 0.04 }}
          >
            <GlassCard className="flex items-center justify-between gap-3 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ClipboardList className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-semibold">{t.name}</h2>
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => openTemplate(t)}>
                Fill Form
              </Button>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

