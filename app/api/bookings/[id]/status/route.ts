import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * PATCH /api/bookings/[id]/status
 *
 * Updates a booking's status. Only the agent on the booking can call this.
 *
 * Allowed transitions (terminal states cannot be re-opened):
 *   pending   → accepted | declined
 *   accepted  → completed | cancelled
 *   completed / declined / cancelled → (terminal — no further transitions)
 *
 * Body: { status: 'accepted' | 'completed' | 'cancelled' | 'declined' }
 *
 * On success:
 *   - Updates bookings.status
 *   - Inserts a notification for the patient
 *   - Returns the updated booking row
 */

type BookingStatus = "pending" | "accepted" | "completed" | "cancelled" | "declined";

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending:   ["accepted", "declined"],
  accepted:  ["completed", "cancelled"],
  completed: [],
  declined:  [],
  cancelled: [],
};

const VALID_NEW_STATUSES = new Set<BookingStatus>([
  "accepted", "completed", "cancelled", "declined",
]);

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  // ── 1. Auth check ─────────────────────────────────────────────────────────
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Parse + validate body ──────────────────────────────────────────────
  const body = await request.json().catch(() => ({}));
  const newStatus = body?.status as BookingStatus | undefined;

  if (!newStatus || !VALID_NEW_STATUSES.has(newStatus)) {
    return NextResponse.json(
      { error: "status must be one of: accepted, completed, cancelled, declined" },
      { status: 400 }
    );
  }

  const bookingId = params.id;
  const admin = getSupabaseAdmin();

  // ── 3. Fetch the booking (verify ownership + get current state) ───────────
  const { data: booking, error: fetchErr } = await admin
    .from("bookings")
    .select(
      `id, status, agent_id, patient_id,
       agent_posts!bookings_post_id_fkey(title),
       agent:profiles!bookings_agent_id_fkey(full_name)`
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchErr || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // ── 4. Verify the caller is the agent on this booking ─────────────────────
  if (booking.agent_id !== user.id) {
    return NextResponse.json(
      { error: "Only the agent on this booking can update its status" },
      { status: 403 }
    );
  }

  // ── 5. Validate the transition ────────────────────────────────────────────
  const currentStatus = booking.status as BookingStatus;
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];

  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      {
        error: `Cannot transition from '${currentStatus}' to '${newStatus}'. ` +
          (allowed.length
            ? `Allowed: ${allowed.join(", ")}`
            : `'${currentStatus}' is a terminal state.`),
      },
      { status: 422 }
    );
  }

  // ── 6. Update the booking ─────────────────────────────────────────────────
  const { data: updated, error: updateErr } = await admin
    .from("bookings")
    .update({ status: newStatus })
    .eq("id", bookingId)
    .select("id, status, created_at, agent_id, patient_id, post_id")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // ── 7. Notify the patient ─────────────────────────────────────────────────
  const postTitle =
    (booking.agent_posts as unknown as { title: string } | null)?.title ?? "your booking";
  const agentName =
    (booking.agent as unknown as { full_name: string | null } | null)?.full_name ?? "Your agent";

  const statusMessages: Record<BookingStatus, string> = {
    accepted:  `${agentName} accepted your booking for "${postTitle}"`,
    completed: `${agentName} marked your booking for "${postTitle}" as completed`,
    cancelled: `${agentName} cancelled your booking for "${postTitle}"`,
    declined:  `${agentName} declined your booking request for "${postTitle}"`,
    pending:   "",
  };

  // Best-effort — don't fail the update if notification insert errors
  await admin.from("notifications").insert({
    user_id: booking.patient_id,
    type:    "booking_status_changed",
    payload: {
      booking_id:  bookingId,
      new_status:  newStatus,
      agent_name:  agentName,
      post_title:  postTitle,
      message:     statusMessages[newStatus],
    },
  });

  return NextResponse.json({ booking: updated });
}
