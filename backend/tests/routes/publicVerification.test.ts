import request from 'supertest';
import express from 'express';

const mockServiceSupabase = {
  from: jest.fn(),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockServiceSupabase),
}));

jest.mock('../../src/utilities/testIntegrity', () => ({
  getTestHashValidity: jest.fn(),
}));

import publicVerificationRoutes from '../../src/routes/publicVerification';
import { getTestHashValidity } from '../../src/utilities/testIntegrity';

const app = express();
app.use('/api/public', publicVerificationRoutes);

let tokenRows: Record<string, unknown>[] = [];
let tokenError: { message: string } | null = null;
let testRows: Record<string, unknown>[] = [];
let testError: { message: string } | null = null;

const TEST_ROW = {
  id: 'test-1',
  officer_id: 1,
  officer_name: 'Officer One',
  badge_number: 'B001',
  driver_name: 'John Doe',
  driver_id: '123456789012',
  driver_dob: '1990-01-01',
  bac_reading: 0.08,
  result: 'fail',
  location: '{"lat":-26.2,"lng":28.04}',
  hash: 'hash-1',
  created_at: '2026-05-30T10:00:00Z'
};

const TOKEN_ROW = {
  id: 1,
  test_id: 'test-1',
  token_hash: 'stored-hash',
  issued_by: 'supervisor@example.com',
  issued_at: '2026-05-30T12:00:00Z',
  revoked_at: null
};

describe('Public Verification Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tokenRows = [TOKEN_ROW];
    tokenError = null;
    testRows = [TEST_ROW];
    testError = null;

    mockServiceSupabase.from.mockImplementation((table: string) => {
      if (table === 'court_verification_tokens') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: tokenRows, error: tokenError }),
            }),
          }),
        };
      }
      if (table === 'tests') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: testRows, error: testError }),
            }),
          }),
        };
      }
      return {
        select: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
  });

  it('returns the allowlisted DTO for a valid token without authentication', async () => {
    (getTestHashValidity as jest.Mock).mockReturnValue(true);

    const response = await request(app)
      .get('/api/public/verify')
      .set('X-Verification-Token', 'opaque-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      referenceId: 'IS-2026-05-30-001',
      hashStatus: 'verified',
      timestamp: '2026-05-30T10:00:00Z',
      issuedAt: '2026-05-30T12:00:00Z',
      officerBadge: 'B001',
      driver: {
        name: 'J*** D**',
        id: '********9012'
      }
    });
  });

  it('reports tampered records', async () => {
    (getTestHashValidity as jest.Mock).mockReturnValue(false);

    const response = await request(app)
      .get('/api/public/verify')
      .set('X-Verification-Token', 'opaque-token');

    expect(response.status).toBe(200);
    expect(response.body.hashStatus).toBe('tampered');
  });

  it('reports unavailable records when no hash is present', async () => {
    (getTestHashValidity as jest.Mock).mockReturnValue(null);

    const response = await request(app)
      .get('/api/public/verify')
      .set('X-Verification-Token', 'opaque-token');

    expect(response.status).toBe(200);
    expect(response.body.hashStatus).toBe('unavailable');
  });

  it('never leaks raw driver or location PII', async () => {
    (getTestHashValidity as jest.Mock).mockReturnValue(true);

    const response = await request(app)
      .get('/api/public/verify')
      .set('X-Verification-Token', 'opaque-token');

    const body = JSON.stringify(response.body);
    expect(body).not.toContain('John Doe');
    expect(body).not.toContain('123456789012');
    expect(body).not.toContain('1990-01-01');
    expect(body).not.toContain('Officer One');
    expect(body).not.toContain('lat');
    expect(body).not.toContain('location');
  });

  it('sets no-store and noindex headers', async () => {
    (getTestHashValidity as jest.Mock).mockReturnValue(true);

    const response = await request(app)
      .get('/api/public/verify')
      .set('X-Verification-Token', 'opaque-token');

    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('returns 400 when the token header is missing', async () => {
    const response = await request(app).get('/api/public/verify');
    expect(response.status).toBe(400);
  });

  it('returns a generic 404 for unknown tokens', async () => {
    tokenRows = [];
    const response = await request(app)
      .get('/api/public/verify')
      .set('X-Verification-Token', 'unknown-token');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Invalid verification link');
  });

  it('returns a generic 404 for revoked tokens', async () => {
    tokenRows = [{ ...TOKEN_ROW, revoked_at: '2026-06-01T00:00:00Z' }];
    const response = await request(app)
      .get('/api/public/verify')
      .set('X-Verification-Token', 'revoked-token');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Invalid verification link');
  });

  it('returns a generic 404 when the linked test no longer exists', async () => {
    testRows = [];
    const response = await request(app)
      .get('/api/public/verify')
      .set('X-Verification-Token', 'opaque-token');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Invalid verification link');
  });
});
