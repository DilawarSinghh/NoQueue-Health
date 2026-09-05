# Scriba

A mobile-first, two-sided marketplace connecting **hospital documentation agents**
with **patients**, plus an **AI-powered self-serve intake** flow.

Patients can browse and book agents who handle hospital paperwork, or use the AI
Agent to complete a doctor-ready intake in minutes. Everything runs behind
Google OAuth, with row-level security on every table.

## Status

- [x] Phase 1 - Database schema + RLS (`supabase/migrations/0001_initial_schema.sql`)
- [x] Phase 2 - Google OAuth, landing page, role selection, both onboarding flows
- [ ] Phase 3 - Agent-side app (dashboard, posts, requests, bookings, DMs)
- [ ] Phase 4 - Patient-side app (feed, bookings, messages)
- [ ] Phase 5 - AI Agent intake (text) + PDF + email
- [ ] Phase 6 - Voice mode
- [ ] Phase 7 - Site-wide assistant
- [ ] Phase 8 - Final mobile + error-state pass

## Stack

- **Next.js 14** (App Router, TypeScript strict) + **Tailwind CSS** + **shadcn/ui**
- **Supabase** (Auth with Google OAuth, Postgres, Realtime, Storage)
- **Groq** for the AI intake and site-wide assistant
- **@react-pdf/renderer** for the doctor-ready PDF
- **Resend** for automated report email
- **Web Speech API** for voice mode
- Deployed on **Vercel**

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` (or `.env`) and fill in:
   `GROQ_API_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `DOCTOR_REPORT_EMAIL` (optional: `RESEND_FROM_EMAIL`).
3. Create the schema: run `supabase/migrations/0001_initial_schema.sql` in the
   Supabase SQL editor (or `supabase db push`). It creates all tables, RLS
   policies, and the `avatars` / `patient-pdfs` storage buckets.
4. Configure **Google OAuth** in Supabase (Authentication > Providers > Google)
   and add `http://localhost:3000` as the Site URL + redirects.
5. `npm run dev` - http://localhost:3000

## Notes / decisions

- **Contact masking:** `profiles.phone/email` and `agent_profiles.whatsapp_number`
  are self-only via RLS. Public feeds render only safe columns (name, avatar,
  hospital, department, rating) via server-side routes. WhatsApp numbers stay
  hidden until a booking/DM is initiated.
- **RSL is enabled on every table**; service-role operations run only in API
  routes, never client-side.
- **No intake report is emailed or finalized** until the patient explicitly
  confirms the review screen. A consent screen gates AI intake data collection.
- Resend: until a sending domain is verified at resend.com/domains, emails can
  only go to the account owner's own email address.
- The Groq model fallback chain lives in `lib/groq.ts` (`GROQ_MODELS`).