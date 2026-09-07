import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session on every request and guards authenticated
// areas (/agent, /patient, /onboarding).
// NOTE: middleware runs on the Edge runtime — cookies() is synchronous here
// (via request/response objects directly, NOT the next/headers cookies()).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do not run any code between createServerClient and getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // ── 1. Unauthenticated access to protected routes ──────────────────────────
  const isProtected =
    path.startsWith("/agent") ||
    path.startsWith("/patient") ||
    path.startsWith("/onboarding");

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // ── 2. Role-mismatch enforcement ───────────────────────────────────────────
  // Authenticated users must only access their own role's routes.
  // We avoid a DB query on every request by reading from the session JWT claims
  // first; only fall back to a DB read when the claim isn't present.
  // Note: role is stored in user_metadata at onboarding time via the profiles
  // table — we read it from the profiles table here since user_metadata can
  // be stale relative to what we store.
  //
  // Skip role check for:
  //   - /onboarding/* (user may not have a role yet)
  //   - /api/*         (API routes do their own auth)
  //   - /auth/*        (callback / error pages)
  if (
    user &&
    !path.startsWith("/onboarding") &&
    !path.startsWith("/api") &&
    !path.startsWith("/auth")
  ) {
    const isAgentRoute   = path.startsWith("/agent");
    const isPatientRoute = path.startsWith("/patient");

    if (isAgentRoute || isPatientRoute) {
      // Fetch role from DB (small overhead; cached by Supabase client on the
      // same request lifecycle via the cookie-backed session)
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const role = profile?.role as "agent" | "patient" | undefined;

      // No profile yet → send to onboarding
      if (!role) {
        const url = request.nextUrl.clone();
        url.pathname = "/onboarding/role";
        url.search   = "";
        return NextResponse.redirect(url);
      }

      // Wrong role → redirect to their own dashboard
      if (isAgentRoute && role !== "agent") {
        const url = request.nextUrl.clone();
        url.pathname = "/patient/dashboard";
        url.search   = "";
        return NextResponse.redirect(url);
      }
      if (isPatientRoute && role !== "patient") {
        const url = request.nextUrl.clone();
        url.pathname = "/agent/dashboard";
        url.search   = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
