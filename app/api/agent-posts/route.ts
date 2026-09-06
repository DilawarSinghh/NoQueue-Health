import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/agent-posts
 *
 * Returns active agent posts with safe public fields only.
 * WhatsApp numbers are intentionally EXCLUDED — they are only
 * revealed server-side after a booking or DM is initiated
 * (spec §10 contact masking decision).
 *
 * Hospital is now implicit (single-hospital deployment: Safdarjung Hospital).
 * The `hospital` column has been removed from agent_posts — no hospital filter needed.
 *
 * Query params:
 *   department — filter by department (optional, exact match from DEPARTMENTS constant)
 *   maxPrice   — filter posts priced at or below this value (optional)
 *   page       — 1-indexed page number (default 1)
 *   pageSize   — results per page (default 20, max 50)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const department = searchParams.get("department") ?? "";
  const maxPrice   = searchParams.get("maxPrice");
  const page       = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize   = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

  const admin = getSupabaseAdmin();

  // Build query — service role bypasses RLS so we can join agent_profiles
  // safely, but we select ONLY the safe columns explicitly.
  let query = admin
    .from("agent_posts")
    .select(
      `id, title, description, price, department, created_at,
       profiles!agent_posts_agent_id_fkey (
         id,
         full_name,
         avatar_url
       ),
       agent_profiles!inner (
         experience_years,
         rating,
         rating_count,
         bio
       )`,
      { count: "exact" }
    )
    .eq("active", true);

  if (department) query = query.eq("department", department);
  if (maxPrice)   query = query.lte("price", Number(maxPrice));

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [], count: count ?? 0, page, pageSize });
}
