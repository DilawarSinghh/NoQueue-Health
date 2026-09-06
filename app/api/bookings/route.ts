import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/bookings
 * Create a booking and fire a notification to the agent.
 *
 * Body: { postId: string; agentId: string }
 * Returns: { bookingId: string }
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
  const postId  = body?.postId  as string | undefined;
  const agentId = body?.agentId as string | undefined;

  if (!postId || !agentId) {
    return NextResponse.json(
      { error: "postId and agentId are required" },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();

  // Prevent duplicate pending bookings for the same post by the same patient
  const { data: existing } = await admin
    .from("bookings")
    .select("id")
    .eq("post_id", postId)
    .eq("patient_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ bookingId: existing.id, alreadyExists: true });
  }

  // Insert booking
  const { data: booking, error: bookErr } = await admin
    .from("bookings")
    .insert({
      post_id:    postId,
      patient_id: user.id,
      agent_id:   agentId,
      status:     "pending",
    })
    .select("id")
    .single();

  if (bookErr) {
    return NextResponse.json({ error: bookErr.message }, { status: 500 });
  }

  // Fire notification to the agent (best-effort — don't fail the booking if this errors)
  await admin.from("notifications").insert({
    user_id: agentId,
    type:    "new_booking",
    payload: {
      booking_id:  booking.id,
      post_id:     postId,
      patient_id:  user.id,
    },
  });

  return NextResponse.json({ bookingId: booking.id });
}
