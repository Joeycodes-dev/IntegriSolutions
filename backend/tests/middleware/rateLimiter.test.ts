import { Hono } from 'hono';
import { apiLimiter, createRateLimiter } from '../../src/middleware/rateLimiter';
import type { AppEnv, Env, RateLimitBinding } from '../../src/env';

type Outcome = { success: boolean; reset?: number; limit?: number; remaining?: number };

interface RecordingBinding extends RateLimitBinding {
  calls: string[];
}

/** Stands in for a Cloudflare `[[ratelimits]]` binding and records every key it
 * is asked about, so tests can assert *who* got charged rather than just
 * whether a request passed. */
function fakeBinding(outcomes: Outcome[]): RecordingBinding {
  const calls: string[] = [];
  return {
    calls,
    async limit({ key }) {
      calls.push(key);
      return outcomes[Math.min(calls.length - 1, outcomes.length - 1)];
    }
  };
}

function bearerFor(sub: string): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `Bearer ${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub })}.signature`;
}

const IP = '203.0.113.9';

function buildApp(env: Partial<Env>) {
  const app = new Hono<AppEnv>();
  app.use('/api/*', createRateLimiter('API_RATE_LIMITER', 'slow down'));
  app.get('/api/tests', (c) => c.json({ ok: true }));
  return {
    get: (headers: Record<string, string> = {}) =>
      app.request('/api/tests', { headers: { 'cf-connecting-ip': IP, ...headers } }, env as Env)
  };
}

describe('rate limiter keying', () => {
  it('charges two users behind the same IP to separate budgets', async () => {
    const binding = fakeBinding([{ success: true }, { success: true }]);
    const backstop = fakeBinding([{ success: true }, { success: true }]);
    const app = buildApp({ API_RATE_LIMITER: binding, IP_RATE_LIMITER: backstop });

    await app.get({ authorization: bearerFor('user-a') });
    await app.get({ authorization: bearerFor('user-b') });

    expect(binding.calls).toEqual(['user:user-a', 'user:user-b']);
  });

  it('falls back to the IP when there is no bearer token', async () => {
    const binding = fakeBinding([{ success: true }]);
    const app = buildApp({ API_RATE_LIMITER: binding });

    await app.get();

    expect(binding.calls).toEqual([`ip:${IP}`]);
  });

  it('falls back to the IP when the token payload cannot be read', async () => {
    const binding = fakeBinding([{ success: true }, { success: true }]);
    const app = buildApp({ API_RATE_LIMITER: binding });

    await app.get({ authorization: 'Bearer not-a-jwt' });
    await app.get({ authorization: 'Bearer a.%%%.c' });

    expect(binding.calls).toEqual([`ip:${IP}`, `ip:${IP}`]);
  });

  it('also draws from the per-IP backstop so a forged sub cannot sidestep limiting', async () => {
    const binding = fakeBinding([{ success: true }]);
    const backstop = fakeBinding([{ success: false, reset: 30 }]);
    const app = buildApp({ API_RATE_LIMITER: binding, IP_RATE_LIMITER: backstop });

    const response = await app.get({ authorization: bearerFor('invented-subject') });

    expect(response.status).toBe(429);
    expect(backstop.calls).toEqual([`ip:${IP}`]);
  });

  it('skips the backstop for anonymous traffic, which is already IP-keyed', async () => {
    const binding = fakeBinding([{ success: true }]);
    const backstop = fakeBinding([{ success: true }]);
    const app = buildApp({ API_RATE_LIMITER: binding, IP_RATE_LIMITER: backstop });

    await app.get();

    expect(binding.calls).toEqual([`ip:${IP}`]);
    expect(backstop.calls).toEqual([]);
  });
});

describe('rate limiter responses', () => {
  it('returns 429 with Retry-After when the limiter rejects', async () => {
    const binding = fakeBinding([{ success: false, reset: 12, limit: 120, remaining: 0 }]);
    const app = buildApp({ API_RATE_LIMITER: binding });

    const response = await app.get();

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
    expect(response.headers.get('RateLimit-Reset')).toBe('12');
    expect(response.headers.get('RateLimit-Limit')).toBe('120');
    await expect(response.json()).resolves.toEqual({ error: 'slow down' });
  });

  it('falls back to the window length when `reset` is not a usable delta', async () => {
    // `reset` is undocumented; a Unix timestamp must never leak out as
    // Retry-After (read as "seconds" it would stall a client for decades).
    const binding = fakeBinding([{ success: false, reset: 1758555123 }]);
    const app = buildApp({ API_RATE_LIMITER: binding });

    const response = await app.get();

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(response.headers.get('RateLimit-Reset')).toBe('60');
  });

  it('falls back to the window length when `reset` is missing entirely', async () => {
    const binding = fakeBinding([{ success: false }]);
    const app = buildApp({ API_RATE_LIMITER: binding });

    const response = await app.get();

    expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('fails open when the binding throws, so a limiter outage is not an outage', async () => {
    const binding: RateLimitBinding = {
      async limit() {
        throw new Error('binding unavailable');
      }
    };
    const app = buildApp({ API_RATE_LIMITER: binding });

    await expect(app.get()).resolves.toMatchObject({ status: 200 });
  });

  it('does not rate limit at all when the binding is absent', async () => {
    const app = buildApp({});

    await expect(app.get()).resolves.toMatchObject({ status: 200 });
  });
});

describe('rate limiter route scoping', () => {
  function buildScopedApp(env: Partial<Env>) {
    const app = new Hono<AppEnv>();
    app.use('/api/*', apiLimiter);
    app.get('/api/public/verify', (c) => c.json({ ok: true }));
    app.get('/api/health', (c) => c.json({ ok: true }));
    app.get('/api/tests', (c) => c.json({ ok: true }));
    return {
      get: (path: string) => app.request(path, { headers: { 'cf-connecting-ip': IP } }, env as Env)
    };
  }

  it('leaves /api/public/* to its own limiter instead of the shared budget', async () => {
    const binding = fakeBinding([{ success: true }]);
    const app = buildScopedApp({ API_RATE_LIMITER: binding });

    await app.get('/api/public/verify');

    expect(binding.calls).toEqual([]);
  });

  it('exempts health checks and the SSE stream', async () => {
    const binding = fakeBinding([{ success: true }]);
    const app = buildScopedApp({ API_RATE_LIMITER: binding });

    await app.get('/api/health');

    expect(binding.calls).toEqual([]);
  });

  it('charges ordinary API traffic to the shared budget', async () => {
    const binding = fakeBinding([{ success: true }]);
    const app = buildScopedApp({ API_RATE_LIMITER: binding });

    await app.get('/api/tests');

    expect(binding.calls).toEqual([`ip:${IP}`]);
  });
});
