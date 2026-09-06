import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// OAuth callback — exchanges the PKCE code for a session, then routes:
//   new user  → /onboarding/role
//   agent     → /agent/dashboard
//   patient   → /patient/dashboard
//   any error → /auth/error  (never dead-ends on a raw Vercel 404)
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
        // Use service role for the profile check — bypasses RLS reliably
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

  // Any failure → friendly error page, never a raw Vercel 404
  return NextResponse.redirect(`${origin}/auth/error`);
}
