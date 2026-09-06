"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Building2, Camera, Check, User } from "lucide-react";
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

// ─── Inline toast ─────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
        type === "success"
          ? "bg-teal-600 text-white"
          : "bg-destructive text-destructive-foreground"
      }`}
      role="status"
      aria-live="polite"
    >
      {type === "success" && <Check className="mr-1.5 inline h-4 w-4" />}
      {message}
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentProfilePage() {
  const router = useRouter();

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer                = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Profile fields
  const [userId, setUserId]                 = useState("");
  const [email, setEmail]                   = useState("");
  const [fullName, setFullName]             = useState("");
  const [phone, setPhone]                   = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [bio, setBio]                       = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [department, setDepartment]         = useState("");
  const [avatarUrl, setAvatarUrl]           = useState<string | null>(null);
  const [photoFile, setPhotoFile]           = useState<File | null>(null);
  const [photoPreview, setPhotoPreview]     = useState<string | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const showToast = (message: string, type: "success" | "error") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/"); return; }
      setUserId(user.id);
      setEmail(user.email ?? "");

      const [profRes, agentRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, phone, avatar_url")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("agent_profiles")
          .select("department, experience_years, bio, whatsapp_number")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (profRes.data) {
        setFullName(profRes.data.full_name  ?? "");
        setPhone(profRes.data.phone         ?? "");
        setAvatarUrl(profRes.data.avatar_url ?? null);
      }
      if (agentRes.data) {
        setDepartment(agentRes.data.department      ?? "");
        setExperienceYears(agentRes.data.experience_years != null
          ? String(agentRes.data.experience_years) : "");
        setBio(agentRes.data.bio                    ?? "");
        setWhatsappNumber(agentRes.data.whatsapp_number ?? "");
      }
      setLoading(false);
    });
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [router]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
    } else {
      setPhotoPreview(null);
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!fullName.trim())   errs.fullName   = "Full name is required.";
    if (!department)        errs.department = "Please select a department.";
    if (experienceYears && (isNaN(Number(experienceYears)) || Number(experienceYears) < 0))
      errs.experienceYears = "Experience must be a non-negative number.";
    return errs;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);

    const supabase = createClient();
    let newAvatarUrl = avatarUrl;

    // Upload new photo if selected
    if (photoFile) {
      const path = `${userId}/${Date.now()}-${photoFile.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, photoFile, { upsert: true });
      if (uploadErr) {
        showToast("Photo upload failed: " + uploadErr.message, "error");
        setSaving(false);
        return;
      }
      newAvatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      setAvatarUrl(newAvatarUrl);
      setPhotoFile(null);
      setPhotoPreview(null);
    }

    const [profErr, agentErr] = await Promise.all([
      supabase
        .from("profiles")
        .update({
          full_name:  fullName.trim(),
          phone:      phone.trim() || null,
          avatar_url: newAvatarUrl,
        })
        .eq("id", userId)
        .then(({ error }) => error),
      supabase
        .from("agent_profiles")
        .update({
          department,
          experience_years: experienceYears ? Number(experienceYears) : null,
          bio:              bio.trim() || null,
          whatsapp_number:  whatsappNumber.trim() || null,
        })
        .eq("user_id", userId)
        .then(({ error }) => error),
    ]);

    setSaving(false);

    if (profErr || agentErr) {
      showToast((profErr ?? agentErr)!.message, "error");
    } else {
      showToast("Profile saved.", "success");
    }
  };

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[50dvh] max-w-lg flex-col justify-center p-4">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  const displayAvatar = photoPreview ?? avatarUrl;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      {toast && <Toast message={toast.message} type={toast.type} />}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="space-y-6"
      >
        {/* ── Profile form ─────────────────────────────────────────────── */}
        <GlassCard className="p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Changes are saved to your account immediately.
          </p>

          <form onSubmit={handleSave} className="mt-6 space-y-5" noValidate>
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                {displayAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={displayAvatar}
                    alt="Profile photo"
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-8 w-8" aria-hidden="true" />
                  </div>
                )}
                <label
                  htmlFor="photo"
                  className="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  aria-label="Change photo"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <input
                    id="photo"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handlePhotoChange}
                  />
                </label>
              </div>
              <div>
                <p className="text-sm font-medium">{fullName || "Agent"}</p>
                <p className="text-xs text-muted-foreground">{email}</p>
              </div>
            </div>

            {/* Email — read-only */}
            <div className="grid gap-2">
              <Label>Email</Label>
              <div className="flex h-11 items-center rounded-xl border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                {email}
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">read-only</span>
              </div>
            </div>

            {/* Full name */}
            <div className="grid gap-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                aria-invalid={!!errors.fullName}
              />
              {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
            </div>

            {/* Phone */}
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
            </div>

            {/* WhatsApp */}
            <div className="grid gap-2">
              <Label htmlFor="whatsapp">WhatsApp number</Label>
              <Input
                id="whatsapp"
                type="tel"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
            </div>

            {/* Hospital — read-only */}
            <div className="grid gap-2">
              <Label>Hospital</Label>
              <div className="flex h-11 items-center gap-2 rounded-xl border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
                {HOSPITAL_NAME}
              </div>
            </div>

            {/* Department */}
            <div className="grid gap-2">
              <Label htmlFor="department">Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger
                  id="department"
                  aria-required="true"
                  aria-invalid={!!errors.department}
                >
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
              {errors.department && (
                <p className="text-xs text-destructive">{errors.department}</p>
              )}
            </div>

            {/* Experience */}
            <div className="grid gap-2">
              <Label htmlFor="experience">Years of experience</Label>
              <Input
                id="experience"
                type="number"
                min={0}
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value)}
                aria-invalid={!!errors.experienceYears}
              />
              {errors.experienceYears && (
                <p className="text-xs text-destructive">{errors.experienceYears}</p>
              )}
            </div>

            {/* Bio */}
            <div className="grid gap-2">
              <Label htmlFor="bio">Short bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A sentence or two about your experience…"
                rows={3}
              />
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </GlassCard>

        {/* ── Danger zone ──────────────────────────────────────────────── */}
        <DangerZone />
      </motion.div>
    </main>
  );
}

// ─── Danger zone (delete account) ────────────────────────────────────────────

function DangerZone() {
  const router = useRouter();
  const [open, setOpen]           = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting]   = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Session expired."); setDeleting(false); return; }

    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? "Deletion failed. Please try again.");
      setDeleting(false);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/?deleted=1");
  };

  return (
    <GlassCard className="border border-red-200 bg-red-50/60 p-6">
      <h2 className="text-base font-semibold text-red-700">Danger zone</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Permanently delete your account and all associated data.
      </p>

      {!open ? (
        <Button
          variant="outline"
          className="mt-4 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={() => setOpen(true)}
        >
          Delete my account
        </Button>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-red-200 bg-white/80 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">This will permanently delete:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Your profile and agent details</li>
              <li>All your service posts</li>
              <li>All bookings you are part of</li>
              <li>All messages you have sent</li>
              <li>Your login access</li>
            </ul>
            <p className="mt-3 font-semibold text-red-600">This cannot be undone.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="confirm-delete" className="text-sm">
              Type <span className="font-mono font-bold">DELETE</span> to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="border-red-200 focus-visible:ring-red-400"
            />
          </div>

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => { setOpen(false); setConfirmText(""); setError(null); }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={confirmText !== "DELETE" || deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? "Deleting…" : "Delete account"}
            </Button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
