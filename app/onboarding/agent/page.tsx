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

export default function AgentOnboardingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [hospital, setHospital] = useState("");
  const [department, setDepartment] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [bio, setBio] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      // Redirect already-onboarded agents away from this form
      const { data: existing } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (existing?.role === "agent") { router.replace("/agent/dashboard"); return; }
      if (existing?.role === "patient") { router.replace("/patient/dashboard"); return; }
      const meta = user.user_metadata as Record<string, unknown>;
      setFullName(typeof meta.full_name === "string" ? meta.full_name : "");
      setLoading(false);
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setWarning(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Your session expired. Please sign in again.");
      setSubmitting(false);
      return;
    }

    // Optional avatar upload (best-effort — storage policies may not be set yet).
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
      id: user.id,
      role: "agent",
      full_name: fullName,
      email: user.email ?? null,
      avatar_url: avatarUrl,
    });

    if (profileError) {
      setError(profileError.message);
      setSubmitting(false);
      return;
    }

    const { error: agentError } = await supabase.from("agent_profiles").insert({
      user_id: user.id,
      hospital,
      department,
      experience_years: experienceYears ? Number(experienceYears) : null,
      bio: bio || null,
      whatsapp_number: whatsappNumber || null,
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
            <div className="grid gap-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="hospital">Hospital</Label>
              <Input id="hospital" value={hospital} onChange={(e) => setHospital(e.target.value)} required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="department">Department</Label>
              <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="experienceYears">Years of experience</Label>
              <Input id="experienceYears" type="number" min={0} value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="bio">Short bio</Label>
              <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A sentence or two about your experience…" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="whatsappNumber">WhatsApp number</Label>
              <Input id="whatsappNumber" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="e.g. +91 98765 43210" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="photo">Profile photo (optional)</Label>
              <Input id="photo" type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
            </div>

            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
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
