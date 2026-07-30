# Integriscan Server

Node.js + Express REST API for the IntegriScan platform. Handles authentication, test records, and profile management via Supabase.

## Account hierarchy

1. **Admin** creates **Supervisor** invites (User Management → Add Supervisor)
2. **Supervisor** creates **Officer** accounts (Officers → Add Officer + invite)
3. Public self-registration is disabled (except first-admin bootstrap via `POST /api/auth/register` when no admin exists)

Admins are stored in `admin_users`. Supervisors are stored in `supervisor_users`. Field officers are stored in `officer_users`.

## Getting Started

1. Install dependencies:
   `npm install`

2. Copy env vars and fill in your values:
   `cp .env.example .env.local`

3. Apply SQL in the Supabase SQL Editor (in order):
   - `migrations/20260729_core_schema.sql` — users, immutable `tests`, invalidations, settings
   - `migrations/20260729_admin_users.sql`
   - `migrations/20260719_officer_invitations.sql`
    - `migrations/20260729_supervisor_invitations.sql`
   - `migrations/20260728_evidence_annotations_audit.sql`  
     (creates `audit_logs`, `annotations`, `evidence`, and the `evidence` storage bucket)

Note: **Test records cannot be updated or deleted** (WORM triggers). Account status is updated via:
- `PATCH /api/admin/users/:id` (activate/deactivate supervisors & admins)
- `PATCH /api/supervisor/officers/:id` (activate/deactivate field officers)

4. Run the app:
   `npm run dev`

The server starts on `http://localhost:4000` by default.

## Invite Email

Supervisor and officer onboarding emails are sent with Resend when admins add supervisors or supervisors add officers.

Required environment variables:

- `RESEND_API_KEY`: API key from Resend.
- `RESEND_FROM_EMAIL`: Verified sender, for example `IntegriScan <noreply@your-domain.com>`.
- `OFFICER_INVITE_BASE_URL`: Link base included in invite emails. Use `integriscan://onboard` for mobile deep links, or an HTTPS fallback page that opens the app.
- `SUPERVISOR_INVITE_BASE_URL`: Link base for supervisor web invites. Defaults to `FRONTEND_URL?supervisorInvite=1`.

If Resend is not configured or email delivery fails, the account profile + invite are still created and the API returns a copyable `inviteLink` to share manually.
