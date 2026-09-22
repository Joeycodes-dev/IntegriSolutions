import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv, Env, RateLimitBinding } from '../env';

// Cloudflare rate-limit bindings only support fixed windows of 10s or 60s.
// Legacy express-rate-limit windows of 15 minutes are mapped to an equivalent
// per-minute density in wrangler.toml (see each binding's comment there).
type LimiterBindingName =
  | 'AUTH_RATE_LIMITER'
  | 'API_RATE_LIMITER'
  | 'SYNC_RATE_LIMITER'
  | 'VERIFY_RATE_LIMITER'
  | 'GEOCODE_RATE_LIMITER';

function getClientKey(c: Context): string {
  const cfIp = c.req.header('cf-connecting-ip');
  if (cfIp) return cfIp;

  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return '0.0.0.0';
}

function applyStandardHeaders(c: Context, result: Awaited<ReturnType<RateLimitBinding['limit']>>): void {
  if (typeof result.remaining === 'number') {
    c.header('RateLimit-Remaining', String(result.remaining));
  }
  if (typeof result.reset === 'number') {
    c.header('RateLimit-Reset', String(result.reset));
  }
  if (typeof result.limit === 'number') {
    c.header('RateLimit-Limit', String(result.limit));
  }
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

    try {
      const result = await binding.limit({ key: getClientKey(c) });
      applyStandardHeaders(c, result);
      if (!result.success) {
        return c.json({ error: message }, 429);
      }
    } catch (err) {
      console.error(`[ratelimit] ${bindingName} failed:`, err);
    }

    await next();
  };
}

export const authLimiter = createRateLimiter(
  'AUTH_RATE_LIMITER',
  'Too many authentication attempts, please try again after 15 minutes'
);

export const apiLimiter = createRateLimiter(
  'API_RATE_LIMITER',
  'Too many requests, please try again later',
  {
    // SSE stream is long-lived; don't count it against the API budget
    skip: (pathname) => pathname.includes('/api/tests/stream') || pathname.includes('/api/health')
  }
);

export const syncLimiter = createRateLimiter(
  'SYNC_RATE_LIMITER',
  'Too many sync requests, please try again after 1 minute'
);

export const verifyLimiter = createRateLimiter(
  'VERIFY_RATE_LIMITER',
  'Too many verification requests, please try again later'
);

// Per-user cap on top of the global Nominatim throttle in routes/geocode.ts —
// this just stops one signed-in user from spamming searches.
export const geocodeLimiter = createRateLimiter(
  'GEOCODE_RATE_LIMITER',
  'Too many location searches, please try again shortly'
);
