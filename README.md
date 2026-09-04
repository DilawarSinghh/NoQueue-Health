# Scriba

Mobile-first web app that replaces slow hospital paperwork with an AI-guided
conversational intake, ending in a doctor-ready PDF.

## Stack

- **Next.js 14** (App Router, TypeScript strict) + **Tailwind CSS** + **shadcn/ui**
- **Groq** (OpenAI-compatible SDK, JSON mode) for the conversational intake
- **Supabase** (Postgres `intake_records` table + private `patient-pdfs` storage bucket)
- **@react-pdf/renderer** for the doctor-ready PDF
- **Resend** for clinic notification email
- Deployed on **Vercel**

## Screens & flow

1. `/` - landing + consent checkbox (Start is gated on consent)
2. `/intake` - AI chat collects the 14 schema fields one at a time,
   live progress indicator, auto-advances when required fields are done
3. `/review` - every field editable, Zod validation on every keystroke,
   Confirm & Generate PDF
4. `/success` - confirmation + signed-URL download (24h) + Start another

API routes (all server-side, all inputs Zod-validated):

- `POST /api/chat` - conversation in, `{ updatedData, nextQuestion, isComplete }` out
- `POST /api/generate-pdf` - validated JSON in, `{ pdfUrl }` (signed) out
- `POST /api/submit` - stores the record + emails the clinic the PDF

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` (or `.env.local`) and fill in:
   `GROQ_API_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `HOSPITAL_NOTIFY_EMAIL` (optional: `RESEND_FROM_EMAIL`).
3. Create the table: run `supabase/schema.sql` in the Supabase SQL editor.
   The private `patient-pdfs` storage bucket is auto-created on first PDF.
4. `npm run dev` - http://localhost:3000

## Notes

- Patient data lives only in client state until the user confirms on the
  review screen; nothing is emailed or stored before that point.
- All secrets are server-only. Signed PDF URLs expire after 24 hours.
- Resend: until a sending domain is verified at resend.com/domains, emails
  can only go to the account owner's own email address.
- The Groq model (`openai/gpt-oss-120b`) has automatic fallbacks if retired
  (see `GROQ_MODELS` in `lib/groq.ts`).
