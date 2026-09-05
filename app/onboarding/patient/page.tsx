"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const GENDER_OPTIONS = ["Male", "Female", "Other", "Prefer not to say"];

export default function PatientOnboardingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [allergies, setAllergies] = useState("");
  const [chronicConditions, setChronicConditions] = useState("");

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (user) {
          const meta = user.user_metadata as Record<string, unknown>;
          setFullName(typeof meta.full_name === "string" ? meta.full_name : "");
          setPhone(typeof meta.phone === "string" ? meta.phone : "");
        }
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Your session expired. Please sign in again.");
      setSubmitting(false);
      return;
    }

    const meta = user.user_metadata as Record<string, unknown>;
    const { error: profileError } = await supabase.from("profiles").insert({
      id: user.id,
      role: "patient",
      full_name: fullName,
      email: user.email ?? null,
      phone: phone || null,
      avatar_url: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
    });

    if (profileError) {
      setError(profileError.message);
      setSubmitting(false);
      return;
    }

    const { error: patientError } = await supabase
      .from("patient_profiles")
      .insert({
        id: user.id,
        age: age ? Number(age) : null,
        gender: gender || null,
        allergies: allergies || null,
        chronic_conditions: chronicConditions || null,
      });

    if (patientError) {
      setError(patientError.message);
      setSubmitting(false);
      return;
    }

    router.push("/patient/dashboard");
    router.refresh();
  };

  if (loading) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center p-4">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg p-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <GlassCard className="p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Your details</h1>
          <p className="mt-1 text-muted-foreground">
            We&apos;ll pre-fill your AI intake so it never re-asks the basics.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +91 98765 43210" required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="age">Age</Label>
              <Input id="age" type="number" min={0} value={age} onChange={(e) => setAge(e.target.value)} required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="gender">Gender</Label>
              <select
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                required
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="" disabled>
                  Select…
                </option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="allergies">Known allergies (optional)</Label>
              <Textarea id="allergies" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. Penicillin, peanuts" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="chronicConditions">Chronic conditions (optional)</Label>
              <Textarea id="chronicConditions" value={chronicConditions} onChange={(e) => setChronicConditions(e.target.value)} placeholder="e.g. Diabetes, high blood pressure" />
            </div>

            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

            <Button type="submit" size="lg" className="mt-2" disabled={submitting}>
              {submitting ? "Saving…" : "Finish and go to dashboard"}
            </Button>
          </form>
        </GlassCard>
      </motion.div>
    </main>
  );
}
