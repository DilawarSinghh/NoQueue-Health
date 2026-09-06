import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/threads
 * Find or create an agent_patient thread between the calling user and a peer.
 *
 * Body: { peerId: string }
 * Returns: { threadId: string }
 *
 * Uses service role to read threads (RLS only allows participants to see their
 * own rows — we need to check both orderings without two round-trips).
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const peerId = body?.peerId as string | undefined;

  if (!peerId || typeof peerId !== "string") {
    return NextResponse.json({ error: "peerId is required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Check both participant orderings — admin bypasses RLS for the lookup
  const { data: existing } = await admin
    .from("threads")
    .select("id")
    .eq("type", "agent_patient")
    .or(
      `and(participant_a.eq.${user.id},participant_b.eq.${peerId}),` +
        `and(participant_a.eq.${peerId},participant_b.eq.${user.id})`
    )
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ threadId: existing.id });
  }

  // Create new thread — insert as the calling user (participant_a = caller)
  const { data: thread, error } = await admin
    .from("threads")
    .insert({
      type: "agent_patient",
      participant_a: user.id,
      participant_b: peerId,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ threadId: thread.id });
}
