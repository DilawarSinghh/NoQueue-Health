import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
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
    // @supabase/ssr v0.5+ requires cookies() to be awaited
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

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
