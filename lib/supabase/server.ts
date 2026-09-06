import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server client (anon key + the user's session cookie).
// Used in Server Components and Route Handlers. RLS still applies.
// NOTE: cookies() must be awaited in @supabase/ssr v0.5+
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore;
            // middleware refreshes the session.
          }
        },
      },
    }
  );
}
