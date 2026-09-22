# Integriscan Server

Cloudflare Workers (Hono) REST API for the IntegriScan platform. Handles authentication, test records, offline sync, SSE, and profile management via Supabase.

- **Live (`cloudflare-version` branch):** <https://integri-backend.thabza102.workers.dev>
- **Runtime:** Cloudflare Workers — Hono router, `nodejs_compat` (`wrangler.toml`)

> The `main` branch still runs the original Express server on DigitalOcean
> (`https://integriscan-backend-seyjs.ondigitalocean.app`). Everything in this
> branch is the Cloudflare migration and deploys to Workers.

## Account hierarchy

1. **Admin** creates **Supervisor** invites (User Management → Add Supervisor)
2. **Supervisor** creates **Officer** accounts (Officers → Add Officer + invite)
3. Admins can register from the web app via `POST /api/auth/register`; supervisors and officers are invite-created.

Admins are stored in `admin_users`. Supervisors are stored in `supervisor_users`. Field officers are stored in `officer_users`.

## Local development

1. Install dependencies:
   `npm install`

2. Create `backend/.dev.vars` (gitignored — never commit it):

   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   FRONTEND_URL=http://localhost:3000
   # Optional — invite emails via Resend
   RESEND_API_KEY=
   RESEND_FROM_EMAIL=
   OFFICER_INVITE_BASE_URL=integriscan://onboard
   SUPERVISOR_INVITE_BASE_URL=
   ```

3. Apply SQL in the Supabase SQL Editor (in order):
   - `migrations/20260729_core_schema.sql` — users, immutable `tests`, invalidations, settings
   - `migrations/20260729_admin_users.sql`
   - `migrations/20260719_officer_invitations.sql`
    - `migrations/20260729_supervisor_invitations.sql`
   - `migrations/20260728_evidence_annotations_audit.sql`  
     (creates `audit_logs`, `annotations`, `evidence`, and the `evidence` storage bucket)
    - `migrations/20260731_shift_roadblock_operations.sql`  
       (creates supervisor roadblock shifts and officer assignments)
   - `sql/migration_add_device_custody_columns.sql`  
     (adds breathalyzer custody columns to `tests` — required before officer apps can sync device-captured readings)

Note: **Test records cannot be updated or deleted** (WORM triggers). Account status is updated via:
- `PATCH /api/admin/users/:id` (activate/deactivate supervisors & admins)
- `PATCH /api/supervisor/officers/:id` (activate/deactivate field officers)

4. Run the worker:
   `npm run dev` — starts `wrangler dev` on <http://localhost:8787>

   Verification:
   `npm test` (jest) · `npm run typecheck` (tsc) · `npm run deploy` (deploy)

## Deployment (Cloudflare Workers)

One-time setup:

- Create the geocode cache namespace and paste its id into `wrangler.toml`:
  `npx wrangler kv namespace create GEOCODE_CACHE`
- Push the secrets:
  - `npx wrangler secret put SUPABASE_URL`
  - `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
  - `npx wrangler secret put FRONTEND_URL` — the deployed web origin (CORS allowlist), e.g. `https://integrisolutions.pages.dev` — exact origin, **no trailing slash**
  - Optional: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `OFFICER_INVITE_BASE_URL`, `SUPERVISOR_INVITE_BASE_URL`

Deploy with `npm run deploy`. The first deploy applies the `SseHub` Durable Object migration automatically.

### Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `GEOCODE_CACHE` | KV namespace | Cached Nominatim geocode lookups |
| `SSE_HUB` | Durable Object | SSE broadcast hub for the supervisor event stream |
| `AUTH_RATE_LIMITER` | Rate limit | 5 req / 60s on `/api/auth/*` |
| `API_RATE_LIMITER` | Rate limit | 27 req / 60s on `/api/*` (health + SSE stream excluded) |
| `SYNC_RATE_LIMITER` | Rate limit | 10 req / 60s on `/api/sync/*` |
| `VERIFY_RATE_LIMITER` | Rate limit | 4 req / 60s on `/api/public/*` |
| `GEOCODE_RATE_LIMITER` | Rate limit | 20 req / 60s on `/api/geocode/*` |

## Invite Email

Supervisor and officer onboarding emails are sent with Resend when admins add supervisors or supervisors add officers.

Required environment variables (Worker secrets in production, `.dev.vars` locally):

- `RESEND_API_KEY`: API key from Resend.
- `RESEND_FROM_EMAIL`: Verified sender, for example `IntegriScan <noreply@your-domain.com>`.
- `OFFICER_INVITE_BASE_URL`: Link base included in invite emails. Use `integriscan://onboard` for mobile deep links, or an HTTPS fallback page that opens the app.
- `SUPERVISOR_INVITE_BASE_URL`: Link base for supervisor web invites. Defaults to `FRONTEND_URL?supervisorInvite=1`.

If Resend is not configured or email delivery fails, the account profile + invite are still created and the API returns a copyable `inviteLink` to share manually.

## OCR

`POST /api/scan` does **not** run OCR on the server. The mobile app runs OCR on-device
(`expo-ai-kit` — ML Kit Text Recognition v2 on Android, Apple Vision on iOS) and posts the
recognized text:

```json
{ "text": "REPUBLIC OF SOUTH AFRICA\nDRIVING LICENCE\n...", "retry": false }
```

The route parses the driver fields and scores confidence:

- `400` — missing text
- `413` — text exceeds the size limit
- `422` — fields could not be read reliably (`{ error, partial }`; `partial` carries the low-confidence parse plus the `_ocr` debug block)
- `200` — `DriverLicenseData` plus `_ocr` (`engine: "ml-kit"`, overall/field confidence, pass preview)

Front-photo OCR is disabled on the web dashboard (barcode scanning is unaffected). The server has
no Google Vision, Tesseract, or image-processing dependencies.
