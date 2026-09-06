// Server Component — no "use client" directive.
// Auth check happens on the server before ANY HTML is sent to the browser,
// so logged-in users are redirected instantly with zero landing-page flash.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingPageClient } from "@/components/LandingPageClient";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: { deleted?: string };
}) {
  // Server-side session check — uses the same cookie-backed client as the rest
  // of the app. If the user has a valid session, redirect before rendering.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role === "agent")   redirect("/agent/dashboard");
    if (profile?.role === "patient") redirect("/patient/dashboard");
    redirect("/onboarding/role");
  }

  // No session — render the marketing page.
  // Pass the `deleted` flag as a plain boolean so the client component can
  // show the "account deleted" confirmation banner without needing searchParams.
  const deleted = searchParams?.deleted === "1";
  return <LandingPageClient deleted={deleted} />;
}
