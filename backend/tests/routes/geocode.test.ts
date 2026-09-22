import { Hono } from 'hono';
import request from '../helpers/request';

jest.mock('../../src/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
  },
}));

import geocodeRoutes from '../../src/routes/geocode';
import { supabase } from '../../src/supabase';
import type { AppEnv } from '../../src/env';

const app = new Hono<AppEnv>();
app.route('/api/geocode', geocodeRoutes);

const originalFetch = global.fetch;

function mockAuthed() {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: 'user-123', email: 'officer@example.com' } },
    error: null,
  });
}

describe('GET /api/geocode/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/geocode/search').query({ q: 'N1 Midrand offramp' });
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects a query that is too short without calling the provider', async () => {
    mockAuthed();
    const res = await request(app)
      .get('/api/geocode/search')
      .set('Authorization', 'Bearer token')
      .query({ q: 'N1' });

    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('resolves a place-name search to lat/lng/label results', async () => {
    mockAuthed();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: '-25.9895', lon: '28.1265', display_name: 'N1, Midrand, Gauteng, South Africa' },
      ],
    });

    const res = await request(app)
      .get('/api/geocode/search')
      .set('Authorization', 'Bearer token')
      .query({ q: 'N1 Midrand offramp' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { lat: -25.9895, lng: 28.1265, label: 'N1, Midrand, Gauteng, South Africa' },
    ]);
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('nominatim.openstreetmap.org/search');
    const options = (global.fetch as jest.Mock).mock.calls[0][1] as { headers: Record<string, string> };
    expect(options.headers['User-Agent']).toBeTruthy();
  });

  it('serves a second identical search from cache without a second provider call', async () => {
    mockAuthed();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '-25.9895', lon: '28.1265', display_name: 'N1, Midrand' }],
    });

    await request(app).get('/api/geocode/search').set('Authorization', 'Bearer token').query({ q: 'N1 Midrand offramp cache test' });
    await request(app).get('/api/geocode/search').set('Authorization', 'Bearer token').query({ q: 'N1 Midrand offramp cache test' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns a 502 with a non-technical message when the upstream provider fails', async () => {
    mockAuthed();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });

    const res = await request(app)
      .get('/api/geocode/search')
      .set('Authorization', 'Bearer token')
      .query({ q: 'unresolvable query text' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/temporarily unavailable/i);
    // Never leak the provider's name, URL, or status code to the client.
    expect(res.body.error).not.toMatch(/nominatim|503/i);
  });

  it('returns the same friendly 502 when the provider request times out (abort)', async () => {
    mockAuthed();
    (global.fetch as jest.Mock).mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));

    const res = await request(app)
      .get('/api/geocode/search')
      .set('Authorization', 'Bearer token')
      .query({ q: 'a query that will time out' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/temporarily unavailable/i);
  });

  it('returns the same friendly 502 when the provider is completely unreachable', async () => {
    mockAuthed();
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('fetch failed'));

    const res = await request(app)
      .get('/api/geocode/search')
      .set('Authorization', 'Bearer token')
      .query({ q: 'a query with no network path' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/temporarily unavailable/i);
  });

  it('degrades a malformed (non-array) provider response to an empty result set instead of crashing', async () => {
    mockAuthed();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ unexpected: 'shape' }) });

    const res = await request(app)
      .get('/api/geocode/search')
      .set('Authorization', 'Bearer token')
      .query({ q: 'malformed response query' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns a friendly 502 when the provider response body is not valid JSON', async () => {
    mockAuthed();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token in JSON');
      }
    });

    const res = await request(app)
      .get('/api/geocode/search')
      .set('Authorization', 'Bearer token')
      .query({ q: 'invalid json response query' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/temporarily unavailable/i);
  });

  it('drops individual malformed rows while keeping the well-formed ones from a mixed response', async () => {
    mockAuthed();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: '-25.9895', lon: '28.1265', display_name: 'N1, Midrand' },
        { lat: 'not-a-number', lon: '28.1265', display_name: 'Broken row' },
        { lat: '-26.2041', lon: '28.0473' } // missing display_name
      ]
    });

    const res = await request(app)
      .get('/api/geocode/search')
      .set('Authorization', 'Bearer token')
      .query({ q: 'mixed quality response query' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ lat: -25.9895, lng: 28.1265, label: 'N1, Midrand' }]);
  });
});
