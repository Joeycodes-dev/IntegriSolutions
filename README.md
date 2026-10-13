# IntegriScan - Smart DUI Enforcement Platform

> *Safer roads. Incorruptible records.*

IntegriScan is a tamper-proof, offline-first digital DUI enforcement system built for South African traffic officers. It replaces paper-based roadside testing with a secure, auditable digital workflow that auto-captures breathalyser readings, locks records against manipulation, and syncs everything to a central cloud database.

---

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| **Android** | **Supported** | Current development target. Includes the native Bluetooth Classic (SPP) bridge that connects to the HC-06 field device. |
| iOS | Roadmap | Not a supported target. See the note below. |
| Web | Supervisor dashboard only | Read/review/export. Officer capture is mobile-only. |

> **iOS is a future roadmap item.** The field device uses an HC-06, which speaks Bluetooth
> Classic SPP over RFCOMM. iOS apps cannot open arbitrary Bluetooth Classic SPP links, so the
> device transport is Android-only today. Supporting iOS would require either different radio
> hardware (Bluetooth Low Energy) or an MFi-licensed accessory, plus a matching change in the
> firmware. `apps/mobile` is an Expo app and can target iOS for the non-device features, but the
> breathalyser path will not work there.

## What's in This Repo

This is a **monorepo** containing all three components of the IntegriScan platform:

```
IntegriSolutions/
├── apps/
│   ├── mobile/       # React Native (Expo) — Traffic Officer mobile app (Android)
│   └── web/          # React + Vite — Supervisor web dashboard
├── backend/          # Cloudflare Workers (Hono) — REST API
└── firmware/
    └── breathalyzer/ # Arduino firmware for the MQ-3 + HC-06 field device
```

| Package | Description | Tech |
|---------|-------------|------|
| `apps/mobile` | Roadside app used by traffic officers to scan IDs, capture breathalyser readings, and store records offline | React Native, Expo, TypeScript, expo-ai-kit (on-device OCR) |
| `apps/web` | Supervisor dashboard for reviewing records, annotating cases, and exporting court-ready reports | React, Vite, TypeScript |
| `backend` | REST API handling authentication, enforcement records, offline sync, and audit logging | Cloudflare Workers, Hono, TypeScript, Supabase |
| `firmware/breathalyzer` | Field-device firmware: MQ-3 sampling, alarm latch, and one-way JSON telemetry over HC-06 Bluetooth Classic SPP | Arduino C++, ATmega328P |

The field device is documented separately in
[`firmware/breathalyzer/docs/TECHNICAL_SPECIFICATION.md`](firmware/breathalyzer/docs/TECHNICAL_SPECIFICATION.md).

---

## Key Features

- **Tamper-proof records** — breathalyser readings are locked on capture; no officer can edit them
- **Offline-first** — full functionality with no internet; records sync automatically when connectivity returns
- **Role-based access** — Officers capture, Supervisors review, Admins manage (enforced at both API and database level)
- **SHA-256 hashing** — every record is hashed at capture; the sync engine rejects anything that doesn't match
- **WORM database** — PostgreSQL rules block all `UPDATE` and `DELETE` on enforcement records
- **Court-ready exports** — supervisors can export individual test records as signed PDF evidence
- **Court verification portal** — every exported PDF carries a QR code that opens a public, anonymous verification page (reference ID, hash status, capture + issuance timestamps, officer badge, redacted driver details)
- **Editable admin configuration** — administrators edit session timeout, PDF export access and watermarking, dashboard alert thresholds, and BAC limits per driver category; changes are revisioned and audited
- **Full audit trail** — every access and action is logged with user ID and timestamp

---

## Field Device (Breathalyser)

The officer app reads BAC from a small Arduino-based device rather than generating values. Full
documentation — wiring, protocol, timing, bench tests and known issues — is in
[`firmware/breathalyzer/`](firmware/breathalyzer/README.md):

- **`breathalyzer.ino`** — MQTT-free, one-way telemetry. MQ-3 on `A0`, passive buzzer on `D8`,
  HC-06 Bluetooth Classic SPP on `D3` (RX) and `D4` (TX, through a 1 kΩ / 2 kΩ divider).
- Emits one CRLF-terminated JSON line per sample (~0.37–0.44 s apart) to both USB serial and the HC-06.
- **`docs/TECHNICAL_SPECIFICATION.md`** — the reference document.
- **`diagrams/`** and **`wireframes/`** — editable draw.io sources with PNG previews.

> The MQ-3 output is an **uncalibrated screening estimate**, not an evidential measurement. The
> conversion constants are unvalidated defaults, and the device ships one shared serial. See the
> specification's known-issues section before any enforcement use.

## Deployments

The platform is hosted entirely on Cloudflare and deployed from `main`:

| Component | URL | Platform |
|-----------|-----|----------|
| Web dashboard | <https://integrisolutions.pages.dev> | Cloudflare Pages |
| Backend API | <https://integri-backend.smuurt.workers.dev> | Cloudflare Workers |

Clients point at the Cloudflare API:

```env
# apps/web — build-time (Pages project env vars)
VITE_API_BASE_URL=https://integri-backend.smuurt.workers.dev
VITE_PUBLIC_WEB_URL=https://integrisolutions.pages.dev

# apps/mobile — EAS build env
EXPO_PUBLIC_API_BASE_URL=https://integri-backend.smuurt.workers.dev/api
```

The Worker's `FRONTEND_URL` secret must exactly equal the deployed web origin
(`https://integrisolutions.pages.dev` — no trailing slash), otherwise browser requests are
rejected by CORS. Deployment steps live in [`backend/README.md`](backend/README.md) and
[`apps/web/README.md`](apps/web/README.md).

> The former DigitalOcean deployment has been retired: the Express backend was migrated to
> Cloudflare Workers (merged from `cloudflare-version` into `main`) and the DigitalOcean app
> was deleted.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- [npm](https://npmjs.com/) v10 or higher
- An **Android** phone or emulator, plus an Expo dev build or [EAS build](https://docs.expo.dev/build/introduction/) of the mobile app. Expo Go is not enough: front-photo OCR uses `expo-ai-kit` and the HC-06 transport is native Java, so both require a rebuilt development app.
- (Breathalyser hardware only) Arduino Uno/Nano, MQ-3 module, HC-06, passive buzzer — see [`firmware/breathalyzer/README.md`](firmware/breathalyzer/README.md)
- A [Supabase](https://supabase.com/) account with a project created (can skip for now — auth is toggleable)

### 1. Clone the repo

```bash
git clone https://github.com/Joeycodes-dev/IntegriSolutions.git
cd IntegriSolutions
```

### 2. Set up environment variables

The backend runs on Cloudflare Workers. For local development `wrangler` reads `backend/.dev.vars` (never commit this file):

```env
# backend/.dev.vars
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FRONTEND_URL=http://localhost:3000
# Optional — invite emails via Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

In production the same values are Cloudflare secrets, pushed with `npx wrangler secret put <NAME>` — see [`backend/README.md`](backend/README.md).

The web dashboard uses Vite env files:

```env
# apps/web/.env.local
VITE_API_BASE_URL=http://localhost:8787
VITE_PUBLIC_WEB_URL=http://localhost:3000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

> **Never commit `.env.local` / `.dev.vars` files.** They are listed in `.gitignore`.

### 3. Install dependencies

```bash
# Backend
cd backend && npm install

# Web dashboard
cd apps/web && npm install

# Mobile app
cd apps/mobile && npm install
```

### 4. Run the database schema

In your Supabase project, open the **SQL Editor** and run these files **in order**:

1. `backend/migrations/20260729_core_schema.sql` — `officer_users`, `supervisor_users`, `admin_users`, immutable `tests` (WORM), `invalidations`, `system_settings`
2. `backend/migrations/20260729_admin_users.sql`
3. `backend/migrations/20260719_officer_invitations.sql`
4. `backend/migrations/20260729_supervisor_invitations.sql`
5. `backend/migrations/20260728_evidence_annotations_audit.sql` — `audit_logs`, `annotations`, `evidence` + storage bucket
6. `backend/migrations/20260731_shift_roadblock_operations.sql` — supervisor roadblock shifts + officer assignments
7. `backend/migrations/20260801_case_lifecycle.sql` — case lifecycle queues (`case_records`)
8. `backend/migrations/20260801_officer_duty_status.sql` — officer on/off duty status
9. `backend/migrations/20260802_evidence_categories.sql` — evidence photo categories
10. `backend/migrations/20260802_court_verification.sql` — court verification tokens for PDF QR codes
11. `backend/migrations/20260803_admin_configuration.sql` — editable admin configuration registry (session timeout, export governance, alert thresholds, BAC limits)
12. `backend/migrations/20260830_chat_message_reads.sql`, `20260830_chat_message_replies.sql`, `20260830_chat_message_priority.sql`, `20260830_emergency_chat.sql`, `20260831_chat_file_attachments.sql` — chat read state, threaded replies, priority, emergency channel, attachments
13. `backend/migrations/20260901_road_offences.sql` — road-offence records
14. `backend/migrations/20260910_operational_alerts.sql`, then `20260911_operational_alert_location.sql`, `20260912_operational_alert_priority_critical.sql`, `20260913_operational_alert_lifecycle.sql`, `20260914_operational_alert_coverage_lifecycle.sql` — operational alerts
15. `backend/migrations/20260925_sync_evidence_integrity.sql` — additive receipt, device-custody, evidence idempotency, and content-hash metadata
16. `backend/migrations/20261010_test_session_interruptions.sql` — abandoned officer scan/reading sessions for supervisor review

**Important:** DUI test records cannot be edited or deleted (WORM). Status updates use account APIs instead (`PATCH` portal users / field officers).

### 5. Start the development servers

```bash
# Terminal 1 — Backend API (wrangler dev — runs on http://localhost:8787)
cd backend && npm run dev

# Terminal 2 — Web dashboard (runs on http://localhost:3000)
cd apps/web && npm run dev

# Terminal 3 — Mobile app (Android dev build; on-device OCR and the HC-06 bridge are native, so not Expo Go)
cd apps/mobile && npx expo start
```

For mobile development against the local Worker, set `EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:8787/api` — the built-in fallback assumes the legacy port `4000`.

---

## API Overview

All endpoints except `/api/auth/login`, `/api/auth/register`, and invite acceptance endpoints require a `Bearer <token>` JWT in the `Authorization` header.

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| `POST` | `/api/auth/login` | Login and receive a JWT | Public |
| `POST` | `/api/auth/officer-invite` | Accept officer invite + set password | Public |
| `POST` | `/api/auth/supervisor-invite` | Accept supervisor invite + set password | Public |
| `GET` | `/api/tests` | List enforcement test records | Authenticated |
| `POST` | `/api/sync` | Sync offline officer captures (record ID + stored hash duplicate check) | Officer |
| `POST` | `/api/evidence/:testId` | Upload evidence with `Idempotency-Key` and `X-Content-SHA256` | Authenticated |
| `POST` | `/api/scan` | Parse on-device OCR text from a photographed licence (body: `{ "text": "...", "retry": false }`) | Officer |
| `GET` | `/api/shifts/active` | List active roadblock shifts assigned to the signed-in officer | Officer |
| `GET` | `/api/supervisor/shifts` | List roadblock shift assignments | Supervisor |
| `POST` | `/api/supervisor/shifts` | Create a roadblock shift and assign officers | Supervisor |
| `PATCH` | `/api/supervisor/shifts/:id` | Close/cancel/update roadblock shift assignments | Supervisor |
| `PATCH` | `/api/admin/users/:id` | Update portal user status (not tests) | Admin |
| `PATCH` | `/api/supervisor/officers/:id` | Update field officer status | Supervisor |
| `DELETE` | `/api/admin/users/:id` | Remove portal user | Admin |
| `POST` | `/api/supervisor/tests/:id` | Annotate case (approve/refer) | Supervisor |
| `GET` | `/api/admin/settings` | Read the typed admin configuration (session timeout, export governance, alert thresholds, BAC limits) | Admin |
| `PATCH` | `/api/admin/settings` | Update settings (body: `{ "expectedRevision": n, "values": { "<key>": <value> } }`) | Admin |
| `GET` | `/api/config/runtime` | Role-safe runtime settings for web and mobile clients | Authenticated |
| `POST` | `/api/supervisor/verification-tokens` | Issue court verification tokens for PDF exports (body: `{ "testIds": [...] }`) | Supervisor |
| `GET` | `/api/public/verify` | Anonymous court verification lookup (token in `X-Verification-Token` header) | Public |
| `GET` | `/api/health` | Health check | Public |

Test rows are **immutable** (no PUT/PATCH/DELETE on `/api/tests`).

### Court verification portal

Every evidence PDF export (single record or weekly report) now includes a QR code in the page
header. Scanning it opens `/#/verify/<token>` on the web dashboard, bypassing portal login, and
shows a strict allowlist: reference ID, SHA-256 hash status (recomputed server-side), capture
timestamp, verification issuance timestamp, officer badge, and **redacted** driver name/licence.
No raw PII, GPS, notes, annotations, or evidence URLs are exposed.

- Each export receives fresh high-entropy tokens; only SHA-256 hashes of tokens are stored.
- Tokens never expire but can be revoked by clearing `revoked_at` via the database.
- Set `VITE_PUBLIC_WEB_URL` (web) to the public origin so scanned QRs resolve correctly (`https://integrisolutions.pages.dev` in production).
- The public page verifies the immutable test record — not the generated PDF bytes themselves.

---

## Architecture

```
┌──────────────────────┐     ┌──────────────────────┐
│   Mobile App         │     │   Web Dashboard       │
│   (React Native)     │     │   (React + Vite)      │
│   Officer workflow   │     │   Supervisor review   │
│   On-device OCR      │     │   (Cloudflare Pages)  │
└────────┬─────────────┘     └──────────┬────────────┘
         │  HTTPS / JWT                 │  HTTPS / JWT
         └──────────────┬───────────────┘
                        │
               ┌────────▼─────────┐
               │   Backend API    │
               │ Cloudflare Worker│
               │  Hono + JWT/RBAC │
               │  SSE (DO) + KV   │
               └────────┬─────────┘
                        │
               ┌────────▼────────┐
               │   PostgreSQL    │
               │   (Supabase)    │
               │   WORM + RLS    │
               └─────────────────┘
```

The mobile app stores records locally when offline and syncs to the cloud when connectivity is restored. The backend verifies the SHA-256 hash of each record before persisting it.

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code — deployed to Cloudflare (Pages + Workers) |
| `feature/[name]` | Individual feature work (e.g. `feature/auth-login`) |

> `cloudflare-version` has been merged into `main` and is retired.

All changes to `feature/[name]` and `main` go through a **Pull Request**.

---

## User Roles

| Role | App | Permissions |
|------|-----|-------------|
| **Officer** | Mobile app | Capture tests, add evidence, submit records |
| **Supervisor** | Web dashboard | View all records, annotate, generate reports, export PDFs |
| **Admin** | Web dashboard | User management, audit log access, system configuration |

---

## Legal Alcohol Limits (South Africa)

Limits are editable by administrators (System Configuration → BAC Limits) and are applied to
**future captures only**. Officers' driver category is derived from the scanned licence
(professional driving permit or heavy-vehicle codes), and each captured record stores the
effective limit used at capture time.

Defaults:

| Driver Type | Blood (g/100ml) | Breath (mg/1000ml) |
|-------------|----------------|-------------------|
| General driver | 0.05 | 0.24 |
| Professional driver | 0.02 | 0.10 |

---

## The Team

**Integri Solutions** — University of Johannesburg, SWP11Y1 Software Project

| Name | Student Number |
|------|---------------|
| Thabang Kutumela | 219063628 |
| Nandi Dithebe | 220044448 |
| Nthabiseng Motaung | 216061479 |
| Skhulile Dhlamini | 220046269 |
| Philadelphia Nkuna | 219101795 |
| Busani Malunga | 225256428 |

---
 
## Contributing
 
### Workflow
 
All contributions follow a **feature branch → Pull Request → review → merge** flow. Direct commits to  `main` will be blocked.
 
```bash
# 1. Make sure your local main is up to date
git checkout main
git pull origin main

# 2. Create your feature branch off main
git checkout -b feature/your-feature-name

# 3. Do your work, then commit with a clear message
git add .
git commit -m "feat: short description of what you did"

# 4. Push and open a Pull Request into main
git push origin feature/your-feature-name
```

 
Then open a Pull Request on GitHub from `feature/your-feature-name` → `main`.
 
### Branch Naming
 
| Type | Pattern | Example |
|------|---------|---------|
| New feature | `feature/[name]` | `feature/auth-login` |
| Bug fix | `fix/[name]` | `fix/sync-duplicate-records` |
| Emergency patch | `hotfix/[name]` | `hotfix/jwt-expiry-crash` |
| Documentation | `docs/[name]` | `docs/api-endpoints` |
 
### Pull Request Rules

- Every PR must target `main`
- The PR author is responsible for resolving merge conflicts before requesting review
### Commit Message Convention
 
Use the [Conventional Commits](https://www.conventionalcommits.org/) format so the history stays readable:
 
```
feat: add offline sync retry logic
fix: prevent duplicate test records on re-sync
docs: update API endpoint table in README
refactor: extract JWT middleware into separate file
test: add unit tests for hash verification service
```
 
### Repository
 
🔗 [github.com/Joeycodes-dev/IntegriSolutions](https://github.com/Joeycodes-dev/IntegriSolutions)

---

## License

This project is developed for academic and pilot purposes. All rights reserved — Integri Solutions © 2026.
