import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// supabase.ts — two isolated clients.
//
// SECURITY (spec §6):
// - getSupabaseAdmin() uses SUPABASE_SERVICE_ROLE_KEY — SERVER ONLY, never
//   import this module from client code ("use client" components must not
//   call getSupabaseAdmin).
// - getSupabaseBrowser() uses only the public NEXT_PUBLIC_* vars.

export const PATIENT_PDFS_BUCKET = "patient-pdfs";

let adminClient: SupabaseClient | null = null;

/** Server-side admin client (service role, bypasses RLS). API routes only. */
export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase server env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
    );
  }
  if (!adminClient) {
    adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/** Browser-side client (public anon key only — safe to expose). */
export function getSupabaseBrowser(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase browser env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set."
    );
  }
  return createClient(url, anonKey);
}

/**
 * Idempotently ensure the private "patient-pdfs" storage bucket exists.
 * Uses the service-role client, so this works without manual dashboard
 * setup. Safe to call on every PDF generation.
 */
export async function ensurePatientPdfsBucket(
  admin: SupabaseClient
): Promise<void> {
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) throw listError;
  if (buckets?.some((bucket) => bucket.name === PATIENT_PDFS_BUCKET)) return;

  const { error: createError } = await admin.storage.createBucket(
    PATIENT_PDFS_BUCKET,
    {
      public: false, // PDFs only reachable via short-lived signed URLs
      fileSizeLimit: "10MB",
    }
  );
  // Concurrent requests may race to create it — ignore that specific error.
  if (createError && !createError.message.toLowerCase().includes("exists")) {
    throw createError;
  }
}

