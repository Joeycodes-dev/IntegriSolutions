import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';

const router = new Hono<AppEnv>();

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
// Identifies this app to Nominatim, as their usage policy requires — see
// https://operations.osmfoundation.org/policies/nominatim/. No API key: this
// is OpenStreetMap's free public geocoder, not a paid/keyed provider.
const NOMINATIM_USER_AGENT = 'IntegriSolutions/1.0 (operational alerts geocoding)';
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 200;
const RESULT_LIMIT = 5;
const CACHE_TTL_MS = 5 * 60 * 1000;
// Nominatim's usage policy caps at 1 request/second for the whole app, not
// per user — this throttle is process-global (not per-request), unlike
// geocodeLimiter in middleware/rateLimiter.ts which is per signed-in user.
const MIN_REQUEST_SPACING_MS = 1100;
const PROVIDER_TIMEOUT_MS = 8000;
// Shown to the user for any provider-side failure (unreachable, timed out,
// non-2xx, or a response we can't parse) — deliberately generic so it never
// leaks upstream error text, a status code, or the provider's name/URL.
const UNAVAILABLE_MESSAGE = 'Location search is temporarily unavailable — you can still enter coordinates manually';

export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
}

let lastRequestAt = 0;
// In-isolate fallback cache: imperfect across isolates, but GEOCODE_CACHE KV
// (checked below when bound) covers cross-isolate hits, and this Map keeps
// single-isolate deployments (and tests) without a KV binding working.
const cache = new Map<string, { results: GeocodeResult[]; expiresAt: number }>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttledFetch(url: string): Promise<Response> {
  const wait = lastRequestAt + MIN_REQUEST_SPACING_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'application/json' },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Defends against a provider response that isn't the array-of-rows shape we
 * expect (a changed API, an HTML error page served with a 200, etc.) — never
 * trust an external response's shape at the boundary. */
function parseResults(payload: unknown): GeocodeResult[] {
  if (!Array.isArray(payload)) return [];
  const rows = payload as Array<{ lat?: unknown; lon?: unknown; display_name?: unknown }>;
  return rows
    .map((row) => ({
      lat: Number(row.lat),
      lng: Number(row.lon),
      label: typeof row.display_name === 'string' ? row.display_name : ''
    }))
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng) && row.label !== '');
}

router.get('/search', requireAuth, async (c) => {
  const rawQ = c.req.query('q');
  const q = typeof rawQ === 'string' ? rawQ.trim() : '';
  if (q.length < MIN_QUERY_LENGTH) {
    return c.json({ error: `Search text must be at least ${MIN_QUERY_LENGTH} characters` }, 400);
  }
  if (q.length > MAX_QUERY_LENGTH) {
    return c.json({ error: `Search text must be at most ${MAX_QUERY_LENGTH} characters` }, 400);
  }

  const kv = c.env?.GEOCODE_CACHE;
  const kvKey = `geo:${q}`;

  if (kv) {
    const cachedKv = await kv.get(kvKey);
    if (cachedKv) return c.json(JSON.parse(cachedKv));
  }

  const cacheKey = q.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return c.json(cached.results);
  }

  const url = `${NOMINATIM_SEARCH_URL}?format=jsonv2&limit=${RESULT_LIMIT}&q=${encodeURIComponent(q)}`;
  let response: Response;
  try {
    response = await throttledFetch(url);
  } catch {
    // Unreachable, DNS failure, or our own timeout abort — all look the same
    // to the caller: the geocoder isn't answering right now.
    return c.json({ error: UNAVAILABLE_MESSAGE }, 502);
  }
  if (!response.ok) {
    return c.json({ error: UNAVAILABLE_MESSAGE }, 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return c.json({ error: UNAVAILABLE_MESSAGE }, 502);
  }

  const results = parseResults(payload);
  cache.set(cacheKey, { results, expiresAt: Date.now() + CACHE_TTL_MS });
  await kv?.put(kvKey, JSON.stringify(results), { expirationTtl: 300 });

  return c.json(results);
});

export default router;
