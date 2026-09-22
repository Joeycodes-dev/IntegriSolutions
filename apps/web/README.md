# Integriscan Web

React + Vite dashboard for supervisors to review test records and manage the system.

- **Live (`cloudflare-version` branch):** <https://integrisolutions.pages.dev> (Cloudflare Pages)
- **API:** <https://integri-backend.thabza102.workers.dev> (Cloudflare Workers)

> The `main` branch web dashboard stays on DigitalOcean; everything in this branch deploys to Cloudflare.

## Getting Started

1. Install dependencies:
   `npm install`

2. Create `apps/web/.env.local`:

   ```env
   # Local `wrangler dev` backend; production builds use the deployed Worker URL
   VITE_API_BASE_URL=http://localhost:8787
   # Origin embedded in court-verification QR links
   VITE_PUBLIC_WEB_URL=http://localhost:3000
   # Supabase realtime client
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Run the app:
   `npm run dev`

The dashboard runs on `http://localhost:3000` by default.

## Deployment (Cloudflare Pages)

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Output directory | `dist` |
| Production env | `VITE_API_BASE_URL=https://integri-backend.thabza102.workers.dev` |
| Production env | `VITE_PUBLIC_WEB_URL=https://integrisolutions.pages.dev` |
| Production env | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

Notes:

- `VITE_*` values are **baked into the bundle at build time** — after changing one, redeploy the Pages project.
- The backend's `FRONTEND_URL` secret must exactly match the Pages origin (`https://integrisolutions.pages.dev` — no trailing slash), otherwise browser requests are rejected by CORS with a `500 CORS blocked for origin` error.
- The court-verification page uses hash routing (`#/verify/<token>`), so no SPA rewrite rules are required on Pages.
