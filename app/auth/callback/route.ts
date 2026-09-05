import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// OAuth redirect target. Exchanges the code for a session, then routes the
// user based on whether a profile already exists:
//   - no profile  -> /onboarding/role (first-time signup)
//   - agent       -> /agent/dashboard
//   - patient     -> /patient/dashboard
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Server-side check (service role) — reliable regardless of RLS.
        const admin = getSupabaseAdmin();
        const { data: profile } = await admin
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        const redirectTo = profile?.role
          ? profile.role === "agent"
            ? "/agent/dashboard"
            : "/patient/dashboard"
          : "/onboarding/role";

        return NextResponse.redirect(`${origin}${redirectTo}`);
      }
    }
  }

  // Fallback on any error — back to the landing page.
  return NextResponse.redirect(`${origin}/`);
}
