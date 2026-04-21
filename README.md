# IntegriScan - Smart DUI Enforcement Platform

> *Safer roads. Incorruptible records.*

IntegriScan is a tamper-proof, offline-first digital DUI enforcement system built for South African traffic officers. It replaces paper-based roadside testing with a secure, auditable digital workflow that auto-captures breathalyser readings, locks records against manipulation, and syncs everything to a central cloud database.

---

## What's in This Repo

This is a **monorepo** containing all three components of the IntegriScan platform:

```
IntegriSolutions/
├── apps/
│   ├── mobile/       # React Native (Expo) — Traffic Officer mobile app
│   └── web/          # React + Vite — Supervisor web dashboard
├── backend/          # Node.js + Express — REST API
```

| Package | Description | Tech |
|---------|-------------|------|
| `apps/mobile` | Roadside app used by traffic officers to scan IDs, capture breathalyser readings, and store records offline | React Native, Expo, TypeScript |
| `apps/web` | Supervisor dashboard for reviewing records, annotating cases, and exporting court-ready reports | React, Vite, TypeScript |
| `backend` | REST API handling authentication, enforcement records, offline sync, and audit logging | Node.js, Express, TypeScript, Supabase |

---

## Key Features

- **Tamper-proof records** — breathalyser readings are locked on capture; no officer can edit them
- **Offline-first** — full functionality with no internet; records sync automatically when connectivity returns
- **Role-based access** — Officers capture, Supervisors review, Admins manage (enforced at both API and database level)
- **SHA-256 hashing** — every record is hashed at capture; the sync engine rejects anything that doesn't match
- **WORM database** — PostgreSQL rules block all `UPDATE` and `DELETE` on enforcement records
- **Court-ready exports** — supervisors can export individual test records as signed PDF evidence
- **Full audit trail** — every access and action is logged with user ID and timestamp

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- [npm](https://npmjs.com/) v10 or higher
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (`npm install -g expo-cli`)
- A [Supabase](https://supabase.com/) account with a project created (Not need for NOW, you can toggle on the login to skip authorization)

### 1. Clone the repo

```bash
git clone https://github.com/Joeycodes-dev/IntegriSolutions.git
cd IntegriSolutions
```

### 2. Set up environment variables

Each package has its own `.env.example`. Copy and fill in your values:

```bash
cp backend/.env.example backend/.env.local
cp apps/web/.env.example apps/web/.env.local
```

The key variables you need:

```env
# backend/.env.local
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-secret-minimum-32-characters (WIP- Can SKIP this for now)
PORT=3000

# apps/web/.env.local
VITE_API_URL=http://localhost:3000

# apps/mobile — set in app.json or as Expo env vars
EXPO_PUBLIC_API_URL=http://localhost:3000
```

> **Never commit `.env.local` files.** They are listed in each package's `.gitignore`.

### 3. Install dependencies

```bash
# Backend
cd backend && npm install

# Web dashboard
cd apps/web && npm install

# Mobile app
cd apps/mobile && npm install
```

### 4. Run the database schema (WIP- Can SKIP this for now)

In your Supabase project, open the **SQL Editor** and run the schema file found at:

```
docs/schema.sql
```

This creates all tables (`users`, `drivers`, `tests`, `evidence`, `annotations`, `audit_logs`) and applies the WORM rules and Row Level Security policies.

### 5. Start the development servers

```bash
# Terminal 1 — Backend API (runs on http://localhost:3000)
cd backend && npm run dev

# Terminal 2 — Web dashboard (runs on http://localhost:5173)
cd apps/web && npm run dev

# Terminal 3 — Mobile app (opens Expo Go)
cd apps/mobile && npx expo start
```

---

## API Overview

All endpoints except `/auth/login` and `/auth/register` require a `Bearer <token>` JWT in the `Authorization` header.

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| `POST` | `/auth/register` | Create a new user account | Public |
| `POST` | `/auth/login` | Login and receive a JWT | Public |
| `POST` | `/drivers/scan` | Scan and extract driver ID details | Officer |
| `POST` | `/tests` | Start a new DUI test session | Officer |
| `POST` | `/tests/:id/capture` | Auto-capture breathalyser reading | Officer |
| `POST` | `/tests/:id/confirm` | Officer confirms and locks the reading | Officer |
| `POST` | `/tests/:id/evidence` | Attach photo and notes | Officer |
| `POST` | `/tests/:id/invalid` | Mark test invalid with reason | Officer |
| `POST` | `/tests/:id/retest` | Create a retest linked to original | Officer |
| `POST` | `/tests/:id/submit` | Lock and queue record for sync | Officer |
| `POST` | `/sync` | Upload offline records to cloud | Officer |
| `GET` | `/tests` | List and search all test records | Supervisor |
| `GET` | `/tests/:id` | View full test detail (read-only) | Supervisor |
| `POST` | `/tests/:id/annotate` | Add supervisor annotation | Supervisor |
| `GET` | `/tests/:id/export` | Export court-ready PDF | Supervisor |
| `GET` | `/reports` | Generate summary reports | Supervisor |
| `GET` | `/audit/log` | View full audit trail | Admin |
| `GET` | `/users` | List all users and roles | Admin |

---

## Architecture

```
┌──────────────────────┐     ┌──────────────────────┐
│   Mobile App         │     │   Web Dashboard       │
│   (React Native)     │     │   (React + Vite)      │
│   Officer workflow   │     │   Supervisor review   │
└────────┬─────────────┘     └──────────┬────────────┘
         │  HTTPS / JWT                 │  HTTPS / JWT
         └──────────────┬───────────────┘
                        │
               ┌────────▼────────┐
               │   Backend API   │
               │  Node / Express │
               │  JWT + RBAC     │
               └────────┬────────┘
                        │
               ┌────────▼────────┐
               │   PostgreSQL    │
               │   (Supabase)    │
               │   WORM + RLS    │
               └─────────────────┘
```

The mobile app stores records locally in an **encrypted SQLite database** (SQLCipher / AES-256) when offline, then syncs to the cloud when connectivity is restored. The backend verifies the SHA-256 hash of each record before persisting it.

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code only — never commit directly |
| `develop` | Integration branch — all features merge here first |
| `feature/[name]` | Individual feature work (e.g. `feature/auth-login`) |
| `hotfix/[name]` | Emergency production patches |

All changes to `develop` and `main` require a **Pull Request with at least one peer review** and passing CI checks.

---

## User Roles

| Role | App | Permissions |
|------|-----|-------------|
| **Officer** | Mobile app | Capture tests, add evidence, submit records |
| **Supervisor** | Web dashboard | View all records, annotate, generate reports, export PDFs |
| **Admin** | Web dashboard | User management, audit log access, system configuration |

---

## Legal Alcohol Limits (South Africa)

The system automatically classifies results against these thresholds:

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
 
All contributions follow a **feature branch → Pull Request → review → merge** flow. Direct commits to `develop` or `main` will be blocked.
 
```bash
# 1. Make sure your local develop is up to date
git checkout develop
git pull origin develop
 
# 2. Create your feature branch off develop
git checkout -b feature/your-feature-name
 
# 3. Do your work, then commit with a clear message
git add .
git commit -m "feat: short description of what you did"
 
# 4. Push and open a Pull Request into develop
git push origin feature/your-feature-name
```
 
Then open a Pull Request on GitHub from `feature/your-feature-name` → `develop`.
 
### Branch Naming
 
| Type | Pattern | Example |
|------|---------|---------|
| New feature | `feature/[name]` | `feature/auth-login` |
| Bug fix | `fix/[name]` | `fix/sync-duplicate-records` |
| Emergency patch | `hotfix/[name]` | `hotfix/jwt-expiry-crash` |
| Documentation | `docs/[name]` | `docs/api-endpoints` |
 
### Pull Request Rules
 
- Every PR must target `develop` — **never open a PR directly into `main`**
- At least **1 peer review and approval** is required before merging
- All CI checks (lint + tests) must pass before the PR can be merged
- The PR author is responsible for resolving merge conflicts before requesting review
- `main` is only updated from `develop` via a release PR, approved by the project lead
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
