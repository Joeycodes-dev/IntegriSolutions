import { Hono } from 'hono';
import request from '../helpers/request';
import { corsMiddleware } from '../../src/middleware/security';
import type { AppEnv } from '../../src/env';

const app = new Hono<AppEnv>();
app.use('*', corsMiddleware);
app.get('/api/health', (c) => c.json({ status: 'ok' }));

describe('CORS middleware (FRONTEND_URL allowlist)', () => {
  it('strips a trailing slash from FRONTEND_URL so the browser origin is allowed', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://integrisolutions.pages.dev')
      .withEnv({ FRONTEND_URL: 'https://integrisolutions.pages.dev/' });

    expect(response.status).toBe(200);
    expect(response.get('Access-Control-Allow-Origin')).toBe('https://integrisolutions.pages.dev');
    expect(response.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('strips whitespace and repeated trailing slashes from FRONTEND_URL', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://integrisolutions.pages.dev')
      .withEnv({ FRONTEND_URL: '  https://integrisolutions.pages.dev///  ' });

    expect(response.status).toBe(200);
    expect(response.get('Access-Control-Allow-Origin')).toBe('https://integrisolutions.pages.dev');
  });

  it('answers CORS preflight for the allowlisted origin', async () => {
    const response = await app.request(
      '/api/health',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://integrisolutions.pages.dev',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,authorization'
        }
      },
      { FRONTEND_URL: 'https://integrisolutions.pages.dev/' }
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://integrisolutions.pages.dev');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(response.headers.get('access-control-allow-headers')).toBe('content-type,authorization');
  });

  it('blocks origins that are not allowlisted', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com')
      .withEnv({ FRONTEND_URL: 'https://integrisolutions.pages.dev' });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('CORS blocked for origin: https://evil.example.com');
  });

  it('passes through requests without an Origin header (native clients)', async () => {
    const response = await request(app)
      .get('/api/health')
      .withEnv({ FRONTEND_URL: 'https://integrisolutions.pages.dev' });

    expect(response.status).toBe(200);
    expect(response.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
