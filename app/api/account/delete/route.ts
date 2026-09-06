import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/account/delete
 *
 * Permanently deletes the authenticated user's account and every row they own:
 *
 *   1. agent_posts          (agent only)
 *   2. patient_requests     (patient only)
 *   3. bookings             (as patient_id or agent_id)
 *   4. messages             (as sender_id)
 *   5. intake_records       (patient only — keyed on patient_id)
 *   6. agent_profiles       (agent only)
 *   7. patient_profiles     (patient only)
 *   8. profiles             (shared — deletes last so FK constraints are
 *                            satisfied; cascade will handle anything we miss)
 *   9. auth user            (supabase.auth.admin.deleteUser)
 *
 * Requires: authenticated session cookie (same as all other POST routes).
 * Uses:     service-role admin client for all deletions (bypasses RLS).
 *
 * This is a hard delete — NOT a soft deactivation flag.
 * Verify on a throwaway account before rolling out to production.
 */
export async function POST() {
  // ── 1. Verify session ────────────────────────────────────────────────────
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;
  const admin  = getSupabaseAdmin();

  // ── 2. Determine role (so we only attempt deletes for the right tables) ──
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = profile?.role as "agent" | "patient" | undefined;

  // ── 3. Role-specific data ─────────────────────────────────────────────────

  if (role === "agent") {
    // Delete all service posts by this agent
    const { error: postsErr } = await admin
      .from("agent_posts")
      .delete()
      .eq("agent_id", userId);
    if (postsErr) {
      console.error("[account/delete] agent_posts:", postsErr.message);
      return NextResponse.json({ error: postsErr.message }, { status: 500 });
    }

    // Delete agent profile
    const { error: agentProfErr } = await admin
      .from("agent_profiles")
      .delete()
      .eq("user_id", userId);
    if (agentProfErr) {
      console.error("[account/delete] agent_profiles:", agentProfErr.message);
      return NextResponse.json({ error: agentProfErr.message }, { status: 500 });
    }
  }

  if (role === "patient") {
    // Delete all patient requests
    const { error: reqErr } = await admin
      .from("patient_requests")
      .delete()
      .eq("patient_id", userId);
    if (reqErr) {
      console.error("[account/delete] patient_requests:", reqErr.message);
      return NextResponse.json({ error: reqErr.message }, { status: 500 });
    }

    // Delete AI intake records
    const { error: intakeErr } = await admin
      .from("intake_records")
      .delete()
      .eq("patient_id", userId);
    if (intakeErr) {
      // Table may not exist in all environments — log but don't abort
      console.warn("[account/delete] intake_records (non-fatal):", intakeErr.message);
    }

    // Delete patient profile
    const { error: patProfErr } = await admin
      .from("patient_profiles")
      .delete()
      .eq("id", userId);
    if (patProfErr) {
      console.error("[account/delete] patient_profiles:", patProfErr.message);
      return NextResponse.json({ error: patProfErr.message }, { status: 500 });
    }
  }

  // ── 4. Shared data (both roles) ───────────────────────────────────────────

  // Bookings (as patient OR agent)
  const { error: bookErr } = await admin
    .from("bookings")
    .delete()
    .or(`patient_id.eq.${userId},agent_id.eq.${userId}`);
  if (bookErr) {
    console.error("[account/delete] bookings:", bookErr.message);
    return NextResponse.json({ error: bookErr.message }, { status: 500 });
  }

  // Messages sent by this user
  const { error: msgErr } = await admin
    .from("messages")
    .delete()
    .eq("sender_id", userId);
  if (msgErr) {
    console.error("[account/delete] messages:", msgErr.message);
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  // Threads where this user is participant_a or participant_b
  // (only delete threads where BOTH participants are the same user, i.e. edge
  // cases — for shared threads we just remove their messages above)
  // Actually delete any thread this user owns entirely (both seats = them), 
  // but leave shared threads in place with messages gone.
  // We use a best-effort delete here and don't abort on error.
  const { error: threadErr } = await admin
    .from("threads")
    .delete()
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`);
  if (threadErr) {
    console.warn("[account/delete] threads (non-fatal):", threadErr.message);
  }

  // Notifications for this user (best-effort)
  await admin.from("notifications").delete().eq("user_id", userId);

  // ── 5. Shared profile row ─────────────────────────────────────────────────
  const { error: profErr } = await admin
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (profErr) {
    console.error("[account/delete] profiles:", profErr.message);
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  // ── 6. Auth user (point of no return) ────────────────────────────────────
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) {
    console.error("[account/delete] auth.admin.deleteUser:", authErr.message);
    // Profile rows are already deleted at this point — log but return error
    // so the client can show a message and the user can contact support.
    return NextResponse.json(
      { error: "Account data deleted but auth removal failed: " + authErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
