import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';

function isDevLocalOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname;
    const protocolOk = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    const localHost = host === 'localhost' || host === '127.0.0.1';
    const lanHost = /^192\.168\.\d+\.\d+$/.test(host) || /^10\.\d+\.\d+\.\d+$/.test(host);
    return protocolOk && (localHost || lanHost);
  } catch {
    return false;
  }
}

// Defaults mirror helmet()'s baseline header set for the previous Express app.
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; font-src 'self' https: data:; form-action 'self'; frame-ancestors 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' https: 'unsafe-inline'; upgrade-insecure-requests"
  );
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  c.header('Cross-Origin-Resource-Policy', 'same-origin');
  c.header('Origin-Agent-Cluster', '?1');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-DNS-Prefetch-Control', 'off');
  c.header('X-Download-Options', 'noopen');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('X-Permitted-Cross-Domain-Policies', 'none');
  c.header('X-XSS-Protection', '0');
  await next();
};

export const corsMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const origin = c.req.header('origin');
  const frontendUrl = c.env?.FRONTEND_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const allowedOrigins = new Set([
    frontendUrl,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173'
  ]);

  if (origin) {
    if (allowedOrigins.has(origin) || isDevLocalOrigin(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Vary', 'Origin');
    } else {
      return c.json({ error: `CORS blocked for origin: ${origin}` }, 500);
    }
  }

  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'DELETE, GET, HEAD, PATCH, POST, PUT');
    const requestedHeaders = c.req.header('access-control-request-headers');
    c.header(
      'Access-Control-Allow-Headers',
      requestedHeaders ?? c.req.header('access-control-request-headers') ?? 'Content-Type, Authorization'
    );
    return c.body(null, 204);
  }

  await next();
};

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  console.log(`[req] ${c.req.method} ${pathname}`);
  await next();
};
