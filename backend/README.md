# Integriscan Server

Node.js + Express REST API for the IntegriScan platform. Handles authentication, test records, and profile management via Supabase.

## Getting Started

1. Install dependencies:
   `npm install`

2. Copy env vars and fill in your values:
   `cp .env.example .env.local`

3. Run the app:
   `npm run dev`

The server starts on `http://localhost:4000` by default.

## Officer Invite Email

Officer onboarding emails are sent with Resend when supervisors add officers.

Required environment variables:

- `RESEND_API_KEY`: API key from Resend.
- `RESEND_FROM_EMAIL`: Verified sender, for example `IntegriScan <noreply@your-domain.com>`.
- `OFFICER_INVITE_BASE_URL`: Link base included in invite emails. Use `integriscan://onboard` for mobile deep links, or an HTTPS fallback page that opens the app.

If Resend is not configured or email delivery fails, officer creation is rolled back so supervisors do not create unusable invites.
