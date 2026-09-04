"use client";

import { useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, FileCheck2 } from "lucide-react";

import { ReviewField } from "@/components/ReviewField";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { CLINIC_NAME } from "@/lib/clinic";
import {
  FIELD_LABELS,
  FIELD_ORDER,
  countCollectedFields,
  patientIntakeSchema,
  type IntakeField,
  type PatientIntakePartial,
} from "@/lib/schema";
import { useIntakeStore } from "@/lib/store";

// Draft keeps `age` as a raw string while typing; it is coerced to a number
// before validation/submit.
type Draft = Omit<PatientIntakePartial, "age"> & { age?: string };

// Friendly per-field messages (amber warnings — spec §5).
const FIELD_ERROR_MESSAGES: Partial<Record<IntakeField, string>> = {
  patientName: "Please enter the patient's name.",
  age: "Please enter the age as a whole number (e.g. 42).",
  gender: "Please enter the patient's gender.",
  contactNumber: "Please enter a contact number with at least 10 digits.",
  doctorOrDepartment: "Please enter the doctor or department.",
  chiefComplaint: "Please describe the reason for the visit.",
};

function buildFieldErrors(
  parsed:
    | { success: true }
    | { success: false; error: z.ZodError }
): Partial<Record<IntakeField, string>> {
  if (parsed.success) return {};
  const flat = parsed.error.flatten().fieldErrors;
  const out: Partial<Record<IntakeField, string>> = {};
  for (const key of FIELD_ORDER) {
    const first = flat[key]?.[0];
    if (first) {
      out[key] =
        FIELD_ERROR_MESSAGES[key] ?? "Please check this field and try again.";
    }
  }
  return out;
}

export default function ReviewPage() {
  const router = useRouter();

  const consented = useIntakeStore((s) => s.consented);
  const data = useIntakeStore((s) => s.data);
  const setData = useIntakeStore((s) => s.setData);
  const setPdfUrl = useIntakeStore((s) => s.setPdfUrl);

  const [draft, setDraft] = useState<Draft>(() => ({
    ...data,
    age: data.age !== undefined ? String(data.age) : undefined,
  }));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards: no consent → landing; nothing collected at all → intake.
  useEffect(() => {
    if (!consented) router.replace("/");
  }, [consented, router]);
  useEffect(() => {
    if (consented && countCollectedFields(data) === 0) {
      router.replace("/intake");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consented, router]);

  function updateField(key: IntakeField, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // Re-validate against the Zod schema on every change (spec §4).
  const payloadForValidation = useMemo(
    () => ({
      ...draft,
      age:
        draft.age !== undefined && draft.age.trim() !== ""
          ? Number.parseInt(draft.age, 10)
          : undefined,
    }),
    [draft]
  );

  const validation = useMemo(
    () => patientIntakeSchema.safeParse(payloadForValidation),
    [payloadForValidation]
  );
  const fieldErrors = useMemo(() => buildFieldErrors(validation), [validation]);
  const isValid = validation.success;

  async function handleConfirm() {
    if (!isValid || confirming) return;
    setConfirming(true);
    setError(null);

    try {
      // knownAllergies has a schema default — normalise empty input to it
      const finalData: PatientIntakePartial = {
        ...payloadForValidation,
        knownAllergies:
          payloadForValidation.knownAllergies?.trim() || "None reported",
      };
      setData(finalData);

      // 1) Generate the PDF (validated again server-side in Step 5)
      const pdfRes = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalData),
      });
      const pdfPayload = (await pdfRes.json().catch(() => null)) as {
        pdfUrl?: string;
        error?: string;
      } | null;
      if (!pdfRes.ok || !pdfPayload?.pdfUrl) {
        throw new Error(
          pdfPayload?.error ||
            "We couldn't create your PDF. Please try again in a moment."
        );
      }
      setPdfUrl(pdfPayload.pdfUrl);

      // 2) Send to the clinic (Step 6)
      const submitRes = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: finalData, pdfUrl: pdfPayload.pdfUrl }),
      });
      if (!submitRes.ok) {
        const submitPayload = (await submitRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          submitPayload?.error ||
            "Your PDF was created, but sending it to the clinic failed. Please try again — your PDF is safe."
        );
      }

      router.push("/success");
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Please try again — nothing is submitted until this succeeds."
      );
    } finally {
      setConfirming(false);
    }
  }

  // Form fields render below
  const field = (key: IntakeField, extra?: { inputMode?: "text" | "numeric" | "tel"; multiline?: boolean; placeholder?: string }) => (
    <ReviewField
      key={key}
      label={FIELD_LABELS[key]}
      value={String(draft[key] ?? "")}
      onChange={(value) => updateField(key, value)}
      required={
        key === "patientName" ||
        key === "age" ||
        key === "gender" ||
        key === "contactNumber" ||
        key === "doctorOrDepartment" ||
        key === "chiefComplaint"
      }
      error={fieldErrors[key] ?? null}
      inputMode={extra?.inputMode}
      multiline={extra?.multiline}
      placeholder={extra?.placeholder}
    />
  );

  return (
    <main className="flex min-h-dvh justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <GlassCard className="p-6 sm:p-8">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">
            {CLINIC_NAME}
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
            Review your details
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            Check everything below and fix anything that looks wrong. Nothing
            is sent until you confirm.
          </p>

          <div className="mt-6 space-y-8">
            <section className="space-y-4" aria-label="Patient details">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Patient details
              </h2>
              {field("patientName")}
              {field("age", { inputMode: "numeric", placeholder: "e.g. 42" })}
              {field("gender")}
              {field("contactNumber", { inputMode: "tel" })}
              {field("address", { multiline: true })}
            </section>

            <section className="space-y-4" aria-label="Visit details">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Visit
              </h2>
              {field("doctorOrDepartment")}
              {field("chiefComplaint", {
                multiline: true,
                placeholder: "e.g. fever and cough for 3 days",
              })}
            </section>

            <section className="space-y-4" aria-label="Medical background">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Medical background
              </h2>
              {field("knownAllergies", {
                placeholder: "None reported",
              })}
              {field("currentMedications", { multiline: true })}
              {field("pastMedicalHistory", { multiline: true })}
            </section>

            <section className="space-y-4" aria-label="Insurance, optional">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Insurance <span className="normal-case">(optional)</span>
              </h2>
              {field("insuranceProvider")}
              {field("insuranceId")}
            </section>

            <section className="space-y-4" aria-label="Emergency contact, optional">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Emergency contact <span className="normal-case">(optional)</span>
              </h2>
              {field("emergencyContactName")}
              {field("emergencyContactNumber", { inputMode: "tel" })}
            </section>
          </div>

          {/* Confirmation error (PDF or send failure) — amber, friendly */}
          {error && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-sm leading-relaxed text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{error}</p>
            </div>
          )}

          <Button
            size="lg"
            className="mt-8 w-full"
            disabled={!isValid || confirming}
            onClick={() => void handleConfirm()}
          >
            <FileCheck2 aria-hidden="true" />
            {confirming ? "Creating your PDF…" : "Confirm & Generate PDF"}
          </Button>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            We&apos;ll create your form and send it to {CLINIC_NAME}.
          </p>
        </GlassCard>
      </motion.div>
    </main>
  );
}

