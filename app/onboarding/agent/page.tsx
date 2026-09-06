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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEPARTMENTS, HOSPITAL_NAME } from "@/lib/constants/hospital";

export default function AgentOnboardingPage() {
  const router = useRouter();

  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [warning, setWarning]       = useState<string | null>(null);

  const [fullName, setFullName]             = useState("");
  const [department, setDepartment]         = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [bio, setBio]                       = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [photoFile, setPhotoFile]           = useState<File | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      // Redirect already-onboarded users away from this form
      const { data: existing } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (existing?.role === "agent")   { router.replace("/agent/dashboard");   return; }
      if (existing?.role === "patient") { router.replace("/patient/dashboard"); return; }
      const meta = user.user_metadata as Record<string, unknown>;
      setFullName(typeof meta.full_name === "string" ? meta.full_name : "");
      setLoading(false);
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!department) {
      setError("Please select a department.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setWarning(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setError("Your session expired. Please sign in again.");
      setSubmitting(false);
      return;
    }

    // Optional avatar upload (best-effort — storage policies may not be set yet)
    const meta = user.user_metadata as Record<string, unknown>;
    let avatarUrl = typeof meta.avatar_url === "string" ? meta.avatar_url : null;
    if (photoFile) {
      const path = `${user.id}/${Date.now()}-${photoFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, photoFile);
      if (uploadError) {
        setWarning("Photo upload skipped: " + uploadError.message);
      } else {
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        avatarUrl = data.publicUrl;
      }
    }

    const { error: profileError } = await supabase.from("profiles").insert({
      id:         user.id,
      role:       "agent",
      full_name:  fullName,
      email:      user.email ?? null,
      avatar_url: avatarUrl,
    });

    if (profileError) {
      setError(profileError.message);
      setSubmitting(false);
      return;
    }

    const { error: agentError } = await supabase.from("agent_profiles").insert({
      user_id:          user.id,
      department,
      experience_years: experienceYears ? Number(experienceYears) : null,
      bio:              bio || null,
      whatsapp_number:  whatsappNumber || null,
    });

    if (agentError) {
      setError(agentError.message);
      setSubmitting(false);
      return;
    }

    router.push("/agent/dashboard");
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
          <h1 className="text-2xl font-semibold tracking-tight">Agent profile</h1>
          <p className="mt-1 text-muted-foreground">
            Tell patients how you can help.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            {/* Full name */}
            <div className="grid gap-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            {/* Hospital — read-only, locked to this deployment */}
            <div className="grid gap-2">
              <Label>Hospital</Label>
              <div className="flex h-11 items-center rounded-xl border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                {HOSPITAL_NAME}
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                  fixed for this platform
                </span>
              </div>
            </div>

            {/* Department — required Select */}
            <div className="grid gap-2">
              <Label htmlFor="department">Department</Label>
              <Select
                value={department}
                onValueChange={setDepartment}
                required
              >
                <SelectTrigger id="department" aria-required="true">
                  <SelectValue placeholder="Select your department…" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Years of experience */}
            <div className="grid gap-2">
              <Label htmlFor="experienceYears">Years of experience</Label>
              <Input
                id="experienceYears"
                type="number"
                min={0}
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value)}
                required
              />
            </div>

            {/* Bio */}
            <div className="grid gap-2">
              <Label htmlFor="bio">Short bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A sentence or two about your experience…"
              />
            </div>

            {/* WhatsApp */}
            <div className="grid gap-2">
              <Label htmlFor="whatsappNumber">WhatsApp number</Label>
              <Input
                id="whatsappNumber"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
            </div>

            {/* Profile photo */}
            <div className="grid gap-2">
              <Label htmlFor="photo">Profile photo (optional)</Label>
              <Input
                id="photo"
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {error   && <p className="text-sm text-destructive" role="alert">{error}</p>}
            {warning && <p className="text-sm text-muted-foreground">{warning}</p>}

            <Button type="submit" size="lg" className="mt-2" disabled={submitting}>
              {submitting ? "Saving…" : "Finish and go to dashboard"}
            </Button>
          </form>
        </GlassCard>
      </motion.div>
    </main>
  );
}
