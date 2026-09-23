import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv, Env, RateLimitBinding } from '../env';

// Cloudflare's Rate Limiting API only supports fixed windows of 10s or 60s:
// https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
// Legacy express-rate-limit windows of 15 minutes are mapped to an equivalent
// per-minute density in wrangler.toml (see each binding's comment there).
type LimiterBindingName =
  | 'AUTH_RATE_LIMITER'
  | 'API_RATE_LIMITER'
  | 'SYNC_RATE_LIMITER'
  | 'VERIFY_RATE_LIMITER'
  | 'GEOCODE_RATE_LIMITER';

type LimitOutcome = Awaited<ReturnType<RateLimitBinding['limit']>>;

// Every binding in wrangler.toml uses a 60s window. Used as the Retry-After
// fallback when the (undocumented) `reset` field is missing or unusable.
const WINDOW_SECONDS = 60;

function getClientIp(c: Context): string {
  const cfIp = c.req.header('cf-connecting-ip');
  if (cfIp) return cfIp;

  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return '0.0.0.0';
}

/**
 * The `sub` claimed by the bearer token, WITHOUT verifying the signature.
 *
 * The limiter deliberately runs before `requireAuth` (we don't want to spend a
 * Supabase round-trip on a request we are about to reject), so this is only a
 * claim. The pattern is kept narrow and bounded so a crafted token cannot
 * inflate the key space — see `getRateLimitKeys()` for how the claim is hedged.
 */
function getClaimedSubject(c: Context): string | null {
  const header = c.req.header('authorization');
  if (!header) return null;

  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;

  const parts = match[1].split('.');
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { sub?: unknown };
    const sub = payload.sub;
    return typeof sub === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(sub) ? sub : null;
  } catch {
    return null;
  }
}

/**
 * Primary key: per signed-in user when the request carries a bearer token, per
 * IP otherwise (login, public verification).
 *
 * Per-IP keying alone was the biggest cause of the reported 429s — everyone
 * behind one office NAT or one mobile carrier's CGNAT shared a single budget, so
 * users starved each other through no fault of their own.
 *
 * Backstop: because `sub` is unverified at this point, identity-keyed requests
 * ALSO draw from `IP_RATE_LIMITER`, a far larger per-IP ceiling. Without it any
 * client could sidestep rate limiting entirely by sending a token with an
 * invented `sub`. Both budgets must pass for the request to proceed.
 */
function getRateLimitKeys(c: Context): { primary: string; backstop: string | null } {
  const ip = `ip:${getClientIp(c)}`;
  const subject = getClaimedSubject(c);
  return subject
    ? { primary: `user:${subject}`, backstop: ip }
    : { primary: ip, backstop: null };
}

/**
 * `limit()` is documented to return `{ success }` only — `limit`, `remaining`
 * and `reset` are undocumented extras whose semantics are not pinned down.
 * Treat `reset` as a hint: trust it when it looks like a delta in seconds that
 * fits inside the window, otherwise fall back to the window length. Emitting an
 * unvalidated value here would give clients a nonsense `Retry-After` (a Unix
 * timestamp read as "seconds" would stall them for decades).
 */
function secondsUntilReset(outcome: LimitOutcome): number {
  const reset = outcome.reset;
  if (typeof reset === 'number' && Number.isFinite(reset) && reset > 0 && reset <= WINDOW_SECONDS) {
    return Math.ceil(reset);
  }
  return WINDOW_SECONDS;
}

function applyStandardHeaders(c: Context, outcome: LimitOutcome): void {
  if (typeof outcome.remaining === 'number') {
    c.header('RateLimit-Remaining', String(outcome.remaining));
  }
  if (typeof outcome.limit === 'number') {
    c.header('RateLimit-Limit', String(outcome.limit));
  }
  c.header('RateLimit-Reset', String(secondsUntilReset(outcome)));
}

function rateLimited(c: Context, message: string, outcome: LimitOutcome) {
  // Retry-After is the contract the clients back off against. Without it they
  // kept polling on their own fixed cadence and turned a brief throttle into a
  // self-sustaining 429 storm.
  c.header('Retry-After', String(secondsUntilReset(outcome)));
  return c.json({ error: message }, 429);
}

export function createRateLimiter(
  bindingName: LimiterBindingName,
  message: string,
  options?: { skip?: (pathname: string) => boolean }
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const binding = (c.env as Env)[bindingName];
    if (!binding) {
      await next();
      return;
    }

    const pathname = new URL(c.req.url).pathname;
    if (options?.skip?.(pathname)) {
      await next();
      return;
    }

    const { primary, backstop } = getRateLimitKeys(c);

    try {
      const result = await binding.limit({ key: primary });
      applyStandardHeaders(c, result);
      if (!result.success) {
        return rateLimited(c, message, result);
      }

      if (backstop) {
        const guard = (c.env as Env).IP_RATE_LIMITER;
        if (guard) {
          const guardResult = await guard.limit({ key: backstop });
          if (!guardResult.success) {
            return rateLimited(c, message, guardResult);
          }
        }
      }
    } catch (err) {
      // Fail open: a rate limiter outage must not take the API down with it.
      console.error(`[ratelimit] ${bindingName} failed:`, err);
    }

    await next();
  };
}

export const authLimiter = createRateLimiter(
  'AUTH_RATE_LIMITER',
  'Too many authentication attempts, please wait a moment and try again'
);

export const apiLimiter = createRateLimiter(
  'API_RATE_LIMITER',
  'Too many requests, please try again shortly',
  {
    skip: (pathname) =>
      // SSE is long-lived — it would spend the budget just by staying open.
      pathname.includes('/api/tests/stream')
      // Health checks are unauthenticated and cheap.
      || pathname.includes('/api/health')
      // /api/public/* is anonymous and has its own, tighter limiter. This skip
      // is what keeps it out of the shared budget; it used to depend purely on
      // this middleware being registered after `app.route('/api/public')` in
      // app.ts, which silently broke if those lines were ever reordered.
      || isPublicPath(pathname)
  }
);

function isPublicPath(pathname: string): boolean {
  return pathname === '/api/public' || pathname.startsWith('/api/public/');
}

export const syncLimiter = createRateLimiter(
  'SYNC_RATE_LIMITER',
  'Too many sync requests, please try again after 1 minute'
);

export const verifyLimiter = createRateLimiter(
  'VERIFY_RATE_LIMITER',
  'Too many verification requests, please try again later'
);

// Per-user cap on top of the global Nominatim throttle in routes/geocode.ts —
// this just stops one signed-in user from spamming searches. (Keys are per-user
// now, so this comment finally matches the behaviour.)
export const geocodeLimiter = createRateLimiter(
  'GEOCODE_RATE_LIMITER',
  'Too many location searches, please try again shortly'
);
