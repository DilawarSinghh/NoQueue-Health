import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/ratings
 *
 * Submits a star rating (and optional review) for a completed booking.
 *
 * Rules enforced server-side:
 *   - Booking must exist and have status='completed'
 *   - Caller must be the patient_id on that booking
 *   - No existing rating for this booking_id (unique constraint + pre-check)
 *   - stars must be 1–5
 *
 * After insert, recalculates the agent's aggregate rating and rating_count
 * and updates agent_profiles.
 *
 * Also inserts a notification for the agent.
 * Ratings are NOT anonymous to the agent (agent sees patient name in notification).
 *
 * Body: { bookingId: string; stars: number; reviewText?: string }
 */
export async function POST(request: Request) {
  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  const body = await request.json().catch(() => ({}));
  const bookingId  = body?.bookingId  as string | undefined;
  const stars      = body?.stars      as number | undefined;
  const reviewText = body?.reviewText as string | undefined;

  if (!bookingId || stars === undefined) {
    return NextResponse.json(
      { error: "bookingId and stars are required" },
      { status: 400 }
    );
  }
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return NextResponse.json(
      { error: "stars must be an integer between 1 and 5" },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();

  // ── 3. Fetch the booking ──────────────────────────────────────────────────
  const { data: booking, error: fetchErr } = await admin
    .from("bookings")
    .select(
      `id, status, patient_id, agent_id,
       agent_posts!bookings_post_id_fkey(title),
       patient:profiles!bookings_patient_id_fkey(full_name)`
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchErr || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // ── 4. Validate caller is the patient on this booking ─────────────────────
  if (booking.patient_id !== user.id) {
    return NextResponse.json(
      { error: "Only the patient on this booking can submit a rating" },
      { status: 403 }
    );
  }

  // ── 5. Booking must be completed ─────────────────────────────────────────
  if (booking.status !== "completed") {
    return NextResponse.json(
      { error: "You can only rate a completed booking" },
      { status: 422 }
    );
  }

  // ── 6. Check for duplicate rating ─────────────────────────────────────────
  const { data: existing } = await admin
    .from("booking_ratings")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "You have already rated this booking" },
      { status: 409 }
    );
  }

  // ── 7. Insert the rating ──────────────────────────────────────────────────
  const { error: insertErr } = await admin
    .from("booking_ratings")
    .insert({
      booking_id:  bookingId,
      patient_id:  user.id,
      agent_id:    booking.agent_id,
      stars,
      review_text: reviewText?.trim() || null,
    });

  if (insertErr) {
    // Unique constraint violation = race-condition double submit
    if (insertErr.code === "23505") {
      return NextResponse.json(
        { error: "You have already rated this booking" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // ── 8. Recalculate aggregate rating for the agent ─────────────────────────
  // Fetch all ratings for this agent, compute avg + count in application code.
  const { data: allRatings } = await admin
    .from("booking_ratings")
    .select("stars")
    .eq("agent_id", booking.agent_id);

  if (allRatings && allRatings.length > 0) {
    const count = allRatings.length;
    const avg   = allRatings.reduce((sum, r) => sum + r.stars, 0) / count;

    await admin
      .from("agent_profiles")
      .update({
        rating:       Math.round(avg * 100) / 100, // 2dp
        rating_count: count,
      })
      .eq("user_id", booking.agent_id);
  }

  // ── 9. Notify the agent ───────────────────────────────────────────────────
  // Ratings are NOT anonymous — agent sees patient name.
  const patientName =
    (booking.patient as unknown as { full_name: string | null } | null)?.full_name ?? "A patient";
  const postTitle =
    (booking.agent_posts as unknown as { title: string } | null)?.title ?? "your service";

  await admin.from("notifications").insert({
    user_id: booking.agent_id,
    type:    "new_rating",
    payload: {
      booking_id:   bookingId,
      stars,
      patient_name: patientName,
      post_title:   postTitle,
      message:      `${patientName} gave you ${stars} star${stars !== 1 ? "s" : ""} for "${postTitle}"`,
    },
  });

  return NextResponse.json({ success: true });
}
