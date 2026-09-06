"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Camera, Check, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const GENDER_OPTIONS = ["Male", "Female", "Other", "Prefer not to say"];
const BLOOD_GROUPS   = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−", "Unknown"];

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

export default function PatientProfilePage() {
  const router = useRouter();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer              = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Profile fields
  const [userId, setUserId]               = useState("");
  const [email, setEmail]                 = useState("");
  const [fullName, setFullName]           = useState("");
  const [phone, setPhone]                 = useState("");
  const [age, setAge]                     = useState("");
  const [gender, setGender]               = useState("");
  const [bloodGroup, setBloodGroup]       = useState("");
  const [allergies, setAllergies]         = useState("");
  const [chronicConditions, setChronicConditions] = useState("");
  const [avatarUrl, setAvatarUrl]         = useState<string | null>(null);
  const [photoFile, setPhotoFile]         = useState<File | null>(null);
  const [photoPreview, setPhotoPreview]   = useState<string | null>(null);

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

      const [profRes, patRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, phone, avatar_url")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("patient_profiles")
          .select("age, gender, blood_group, allergies, chronic_conditions")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      if (profRes.data) {
        setFullName(profRes.data.full_name   ?? "");
        setPhone(profRes.data.phone          ?? "");
        setAvatarUrl(profRes.data.avatar_url ?? null);
      }
      if (patRes.data) {
        setAge(patRes.data.age != null ? String(patRes.data.age) : "");
        setGender(patRes.data.gender             ?? "");
        setBloodGroup(patRes.data.blood_group    ?? "");
        setAllergies(patRes.data.allergies       ?? "");
        setChronicConditions(patRes.data.chronic_conditions ?? "");
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
    if (!fullName.trim())
      errs.fullName = "Full name is required.";
    if (age && (isNaN(Number(age)) || Number(age) < 0 || Number(age) > 130))
      errs.age = "Please enter a valid age.";
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

    const [profErr, patErr] = await Promise.all([
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
        .from("patient_profiles")
        .update({
          age:                age ? Number(age) : null,
          gender:             gender || null,
          blood_group:        bloodGroup || null,
          allergies:          allergies.trim() || null,
          chronic_conditions: chronicConditions.trim() || null,
        })
        .eq("id", userId)
        .then(({ error }) => error),
    ]);

    setSaving(false);

    if (profErr || patErr) {
      showToast((profErr ?? patErr)!.message, "error");
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
                <p className="text-sm font-medium">{fullName || "Patient"}</p>
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

            {/* Age */}
            <div className="grid gap-2">
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="number"
                min={0}
                max={130}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                aria-invalid={!!errors.age}
              />
              {errors.age && <p className="text-xs text-destructive">{errors.age}</p>}
            </div>

            {/* Gender */}
            <div className="grid gap-2">
              <Label htmlFor="gender">Gender</Label>
              <select
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-input bg-white/60 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Select…</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            {/* Blood group */}
            <div className="grid gap-2">
              <Label htmlFor="bloodGroup">Blood group</Label>
              <select
                id="bloodGroup"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-input bg-white/60 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Select…</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </div>

            {/* Allergies */}
            <div className="grid gap-2">
              <Label htmlFor="allergies">Known allergies</Label>
              <Textarea
                id="allergies"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="e.g. Penicillin, peanuts"
                rows={2}
              />
            </div>

            {/* Chronic conditions */}
            <div className="grid gap-2">
              <Label htmlFor="chronicConditions">Chronic conditions</Label>
              <Textarea
                id="chronicConditions"
                value={chronicConditions}
                onChange={(e) => setChronicConditions(e.target.value)}
                placeholder="e.g. Diabetes, high blood pressure"
                rows={2}
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
  const [open, setOpen]               = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting]       = useState(false);
  const [error, setError]             = useState<string | null>(null);

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
              <li>Your profile and health details</li>
              <li>All your service requests</li>
              <li>All bookings you are part of</li>
              <li>All messages you have sent</li>
              <li>All AI intake records</li>
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
