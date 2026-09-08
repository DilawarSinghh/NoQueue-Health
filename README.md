# NoQueue Health

A mobile-first, full-stack web app that eliminates the paperwork chaos at Indian government hospitals. Patients either browse and book a real documentation agent, or use the built-in AI intake agent to self-report symptoms and get a doctor-ready clinical summary PDF — all without re-answering the same basics twice.

Currently deployed to Safdarjung Hospital (New Delhi) as the first pilot.

**Live:** https://no-queue-health.vercel.app

---

## What it does

Most government hospital visits in India involve three separate queues just to fill out the same forms repeatedly. NoQueue Health attacks that problem from two directions at once.

### For patients

- **Browse & book agents** — search vetted human documentation agents by department (40+ Safdarjung departments), price, and star rating. One tap to send a booking request.
- **AI intake** — a conversational chat (text or voice) that collects chief complaint, symptom history, severity, and relevant background. The AI never re-asks anything already in your profile (age, gender, allergies, chronic conditions). When complete, it generates a formatted clinical summary PDF and emails it to the clinic.
- **Department routing** — once the AI has enough information it recommends which department to go to first, with a plain-language reason. If it's uncertain it gives a primary and a secondary option.
- **Emergency detection** — if anything the patient describes sounds urgent (chest pain, difficulty breathing, severe bleeding, stroke signs, etc.) the chat stops immediately and shows an emergency banner with a direct call link.
- **Bookings tracker** — see all past and current bookings and their status (pending / accepted / completed / cancelled / declined).
- **Direct messages** — chat with your booked agent inside the app.
- **Site assistant** — a persistent AI chat widget that answers navigation questions about the platform (strictly no medical advice).

### For agents

- **Service posts** — list what documentation help you offer, your department, price, and a description.
- **Incoming requests** — see every booking request from patients; accept, decline, or mark complete.
- **Patient request board** — browse open patient help requests and proactively reach out.
- **Ratings** — patients leave a 1–5 star review after a completed booking. Rating and count are shown on the agent's profile.
- **DM inbox** — full message thread with each patient.
- **Dashboard stats** — active posts, pending bookings, and unread messages at a glance.

---

## How it's built

### Frontend

- **Next.js 14** (App Router, TypeScript strict mode) — everything is a Server Component by default; client components are opt-in with `"use client"`.
- **Tailwind CSS** + **shadcn/ui** — all UI built on Radix primitives with a glass-morphism visual style.
- **Framer Motion** — page and element entrance animations.
- **Zustand** — client-side state for the AI intake session. Intake data lives only in memory until the patient explicitly confirms on the review screen. Never in localStorage, never in URL params.
- **Web Speech API** — browser-native voice input and speech synthesis for the AI intake. Wrapped in two custom hooks (`useVoiceInput`, `useVoiceSpeech`) that handle the browser quirks and expose a clean interface.

### Auth

- **Supabase Auth** with Google OAuth (PKCE flow).
- The callback handler at `/auth/callback` exchanges the code for a session, then reads the user's `profiles.role` via the service role (bypasses RLS) and routes them to the right dashboard.
- Middleware (`middleware.ts`) refreshes the session cookie on every request so server components always have a fresh session.
- Role is chosen once at onboarding and cannot be changed — enforced by the onboarding flow, not just UI.

### Database (Supabase Postgres)

Ten tables, Row Level Security on all of them:

| Table | Purpose |
|---|---|
| `profiles` | One row per user. Extends `auth.users`. Stores name, avatar, role. |
| `agent_profiles` | Agent-only: department, experience, bio, WhatsApp number, rating. |
| `patient_profiles` | Patient medical basics: age, gender, DOB, blood group, allergies, chronic conditions. Pre-fills AI intake. |
| `agent_posts` | An agent's service listing (title, description, price, department). |
| `patient_requests` | A patient's open help request (department, budget, notes). |
| `bookings` | Links a patient to an agent post. Status: `pending → accepted/declined → completed/cancelled`. |
| `threads` | A conversation. Type is either `agent_patient` or `site_assistant`. |
| `messages` | One row per message in any thread. `is_assistant = true` for AI messages (inserted server-side via service role). |
| `intake_records` | Completed AI intake sessions: structured JSON, clinical summary text, PDF storage path. |
| `notifications` | Lightweight in-app notification rows. |
| `booking_ratings` | One rating per completed booking (1–5 stars + review text). |

**RLS design notes:**
- `profiles`, `agent_profiles`, `patient_profiles` — self-only. Public feeds are served through API routes using the service role, which selects only safe columns (name, avatar, department, rating). WhatsApp numbers stay hidden until a booking is accepted.
- `agent_posts` and `patient_requests` — readable by all authenticated users when `active = true`.
- `bookings`, `threads`, `messages` — participants only.
- `intake_records` — patient owner only.
- A `is_thread_participant()` SQL function (security invoker) handles message-level participant checks efficiently.

- `0001_initial_schema.sql` — full marketplace schema, RLS, indexes, storage buckets.
- `0002_hospital_lockdown.sql` — removes the `hospital` column (single-hospital pilot), adds `CHECK` constraints for the official Safdarjung department list (40 departments). Cleans up any freehand values from dev data.
- `0003_ratings_and_bookings.sql` — adds `declined` status to bookings, creates `booking_ratings` table with RLS.
- `0004_fix_rls_and_realtime.sql` — sets `REPLICA IDENTITY FULL` on realtime tables, re-asserts correct RLS policies for threads/messages/notifications.
- `0005_intake_tier.sql` — adds `tier`, `fallback_occurred`, and `recommended_department` columns to `intake_records`.

### AI (Groq + Kimi K3)

Two separate AI features. The intake now has two selectable tiers.

**AI Intake — Low tier** (`/api/ai-intake/low`)
- Text-only, English only.
- Uses Groq (`openai/gpt-oss-120b` → `qwen/qwen3.6-27b` fallback chain).
- Same JSON contract as before.

**AI Intake — High tier** (`/api/ai-intake/high`)
- Voice input + text; Hindi and English supported.
- Uses Kimi K3 (`kimi-k3`) via Moonshot's OpenAI-compatible endpoint (`https://api.moonshot.ai/v1`).
- `reasoning_effort: "low"` — conversational flow doesn't need deep reasoning.
- Automatic fallback to Low tier if Kimi K3 fails (error logged, patient sees a non-blocking amber notice in chat, conversation continues on Groq).
- System prompt detects and mirrors the patient's language; structured field values stay in English regardless.

Both tiers share identical logic from `lib/intakePrompt.ts`:
- System prompt builder (with optional Hindi language instruction)
- JSON response parser + department name normalisation
- Medication blocklist safety filter on `suggestedInvestigations`

The patient picks their tier on the pre-start screen. No mid-session switching; resetting preserves the tier choice.

**Report generation** (`/api/generate-report`)
- Now stores `tier` and `fallback_occurred` in `intake_records` (migration `0005`).
- No other changes — both tiers funnel through the same route.

**Site assistant** (`/api/site-assistant`)
- Navigation-only assistant. Strictly refuses medical questions.
- Persists full conversation history in `threads` + `messages` so context survives page refreshes.
- GET endpoint returns the user's existing thread on load.

### PDF

`lib/pdfTemplate.tsx` — a `@react-pdf/renderer` document component. Renders:
- Patient name, generated timestamp.
- All structured intake fields in a clean table layout.
- The AI-generated clinical summary section.
- Recommended department + routing reason.
- Mandatory disclaimer footer on every page.

### Email

**Resend** — sends the completed PDF to the clinic email on report generation. Template is plain HTML with the PDF as a base64 attachment. Non-fatal: if the send fails the patient still gets their signed URL.

---

## Project structure

```
app/
  page.tsx                    # Landing page (server component — redirects signed-in users)
  layout.tsx                  # Root layout
  auth/
    callback/route.ts         # OAuth PKCE code exchange + role-based redirect
    error/page.tsx            # Friendly auth error page
  onboarding/
    role/                     # Choose agent or patient
    agent/                    # Agent profile setup
    patient/                  # Patient profile setup
  agent/
    layout.tsx                # Agent shell (nav, auth guard)
    dashboard/                # Stats + quick actions
    agents/                   # Own posts + patient request board
    requests/                 # Incoming booking requests
    messages/                 # DM inbox
    profile/                  # Edit agent profile
  patient/
    layout.tsx                # Patient shell (nav, auth guard)
    dashboard/                # Feature tiles + recent bookings
    hospital-agents/          # Browse & book agents
    bookings/                 # Booking history
    ai-agent/                 # AI intake chat (tier picker: Standard / Advanced)
      review/                 # Review + generate report
      history/                # Past intake records + PDF re-download
    messages/                 # DM inbox
    profile/                  # Edit patient profile
  api/
    ai-intake/
      low/route.ts          # Groq intake endpoint (text, English only)
      high/route.ts         # Kimi K3 intake endpoint (voice, Hindi/English, falls back to Low)
    generate-report/route.ts  # PDF + Supabase Storage + Resend
    site-assistant/route.ts   # Site navigation assistant
    bookings/route.ts         # Create booking / list bookings
    bookings/[id]/status/     # Accept / decline / complete
    agent-posts/route.ts      # CRUD for agent posts
    threads/route.ts          # Create / list DM threads
    ratings/route.ts          # Submit booking rating
    account/delete/route.ts   # Self-service account deletion

components/
  LandingPageClient.tsx       # Marketing landing page
  ChatThread.tsx              # Reusable DM thread component
  GlassCard.tsx               # Shared glass-morphism card
  SiteAssistant.tsx           # Floating AI chat widget
  NotificationBell.tsx        # In-app notification bell
  auth/
    GoogleAuthButton.tsx      # OAuth sign-in button
    SignOutButton.tsx

lib/
  store.ts                    # Zustand intake session store (tier, language, fallback state)
  schema.ts                   # Zod schemas + field definitions for AI intake
  pdfTemplate.tsx             # @react-pdf report document
  groq.ts                     # Groq client singleton (Low tier)
  kimi.ts                     # Kimi K3 client singleton (High tier, Moonshot endpoint)
  intakePrompt.ts             # Shared prompt builder + parser used by both routes
  supabase.ts                 # Supabase service-role client (server only)
  supabase/                   # Cookie-backed client + server + middleware helpers
  hooks/
    useVoiceInput.ts          # Web Speech API — recognition (reactive lang param)
    useVoiceSpeech.ts         # Web Speech API — synthesis (reactive lang param)
  constants/
    hospital.ts               # DEPARTMENTS list (40 Safdarjung departments)

supabase/
  migrations/
    0001_initial_schema.sql
    0002_hospital_lockdown.sql
    0003_ratings_and_bookings.sql
```

---

## Local setup

```bash
# 1. Install
npm install

# 2. Environment — copy and fill in
cp .env.example .env.local
```

Required variables:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings — **never expose to client** |
| `GROQ_API_KEY` | https://console.groq.com/keys |
| `CLINE_API_KEY` | Cline API key from app.cline.bot — optional; High tier auto-falls-back to Groq if absent |
| `RESEND_API_KEY` | https://resend.com/api-keys |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally, your Vercel URL in prod |
| `DOCTOR_REPORT_EMAIL` | Email address that receives intake PDFs |
| `HOSPITAL_NOTIFY_EMAIL` | Notification email for the clinic |

```bash
# 3. Database — run in Supabase SQL Editor (or supabase db push)
supabase/migrations/0001_initial_schema.sql
supabase/migrations/0002_hospital_lockdown.sql
supabase/migrations/0003_ratings_and_bookings.sql
supabase/migrations/0004_fix_rls_and_realtime.sql
supabase/migrations/0005_intake_tier.sql

# 4. Supabase Auth — Authentication > Providers > Google
#    Add redirect URLs:
#      http://localhost:3000/auth/callback
#      https://your-vercel-url.vercel.app/auth/callback

# 5. Run
npm run dev
```

---

## Build status

- [x] Phase 1 — Database schema, RLS, storage buckets
- [x] Phase 2 — Google OAuth, landing page, role selection, onboarding flows (agent + patient)
- [x] Phase 3 — Agent dashboard, posts, booking requests, DMs
- [x] Phase 4 — Patient dashboard, agent feed, bookings, messages
- [x] Phase 5 — AI intake (text + voice), PDF generation, Resend email
- [x] Phase 6 — Voice mode (Web Speech API — input + synthesis)
- [x] Phase 7 — Site-wide assistant
- [ ] Phase 8 — Final mobile polish + comprehensive error-state pass

---

## Key decisions

**Single hospital first.** Migration `0002` locks the schema to Safdarjung Hospital — no freehand hospital field, department is constrained to the official 40-department list. This makes the AI routing recommendation reliable and the agent feed filterable. Multi-hospital is a future migration.

**Contact masking.** `profiles.phone/email` and `agent_profiles.whatsapp_number` are self-only via RLS. The public agent feed is served through a server-side API route using the service role, which selects only safe columns. WhatsApp numbers are revealed only after a booking is accepted — enforced at the API layer.

**Intake data never leaves the client until the patient confirms.** The Zustand store holds all intake data in memory. Nothing is persisted to the database until the patient reviews everything on the review screen and clicks "Generate report". No draft saves, no partial records.

**AI is strictly non-diagnostic.** The system prompt has an explicit rule: no diagnosis, no medication recommendations. Emergency detection is the only time the AI actively intervenes — and it does so by stopping the intake entirely and pointing to emergency services.

**Service role usage.** The service role (bypasses RLS) is used only in API route handlers, never imported into any client component. It's needed for: reading other users' profiles in the agent feed, inserting AI messages (which have no `sender_id`), report generation/storage, and the auth callback profile lookup.

**Resend limitation.** Until a custom sending domain is verified at resend.com/domains, Resend can only deliver to the account owner's own email. The `DOCTOR_REPORT_EMAIL` and `HOSPITAL_NOTIFY_EMAIL` variables should match that address during development.
