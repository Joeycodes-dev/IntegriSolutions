import request from 'supertest';
import express from 'express';
import crypto from 'crypto';

const mockServiceSupabase = {
  from: jest.fn(),
};

jest.mock('../../src/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
  },
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockServiceSupabase),
}));

jest.mock('../../src/utilities/testIntegrity', () => ({
  getTestHashValidity: jest.fn(),
}));

import verificationTokensRoutes from '../../src/routes/supervisor/verificationTokens';
import { supabase } from '../../src/supabase';
import { getTestHashValidity } from '../../src/utilities/testIntegrity';

const app = express();
app.use(express.json());
app.use('/api/supervisor/verification-tokens', verificationTokensRoutes);

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('Verification Token Issuance', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'supervisor-123', email: 'supervisor@example.com' } },
      error: null,
    });

    const roleLookup = (table: string) => {
      if (table === 'admin_users' || table === 'officer_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'supervisor_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [{ supervisor_id: 1, role_id: 2 }],
                error: null,
              }),
            }),
          }),
        };
      }
      return null;
    };

    mockServiceSupabase.from.mockImplementation((table: string) => {
      const roleMock = roleLookup(table);
      if (roleMock) return roleMock;

      if (table === 'tests') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'test-1',
                  officer_id: 1,
                  officer_name: 'Officer One',
                  badge_number: 'B001',
                  driver_name: 'Driver A',
                  driver_id: 'DL001',
                  driver_dob: '1990-01-01',
                  bac_reading: 0.08,
                  result: 'fail',
                  location: '{}',
                  hash: 'hash-1',
                  created_at: '2026-05-30T10:00:00Z',
                },
                {
                  id: 'test-2',
                  officer_id: 2,
                  officer_name: 'Officer Two',
                  badge_number: 'B002',
                  driver_name: 'Driver B',
                  driver_id: 'DL002',
                  driver_dob: '1985-02-02',
                  bac_reading: 0.0,
                  result: 'pass',
                  location: '{}',
                  hash: 'hash-2',
                  created_at: '2026-05-29T14:00:00Z',
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'court_verification_tokens') {
        return {
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === 'audit_logs') {
        return {
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {
        select: jest.fn().mockResolvedValue({ data: [], error: null }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  });

  it('issues fresh tokens for each test and stores only hashes', async () => {
    (getTestHashValidity as jest.Mock).mockReturnValue(true);

    const response = await request(app)
      .post('/api/supervisor/verification-tokens')
      .set('Authorization', 'Bearer valid-token')
      .send({ testIds: ['test-1', 'test-2'] });

    expect(response.status).toBe(201);
    expect(response.body).toHaveLength(2);

    const first = response.body[0];
    expect(first.testId).toBe('test-1');
    expect(first.token).toMatch(/^[0-9a-f]{64}$/);
    expect(first.referenceId).toBe('IS-2026-05-30-001');
    expect(first.hash).toBe('hash-1');
    expect(first.hashStatus).toBe('verified');
    expect(first.officerBadge).toBe('B001');
    expect(first.timestamp).toBe('2026-05-30T10:00:00Z');
    expect(new Date(first.issuedAt).getTime()).not.toBeNaN();
    expect(first.token).not.toBe(response.body[1].token);

    const insertIndex = mockServiceSupabase.from.mock.calls.findIndex(
      ([table]) => table === 'court_verification_tokens'
    );
    const inserted = mockServiceSupabase.from.mock.results[insertIndex].value.insert.mock
      .calls[0][0] as Array<{ test_id: string; token_hash: string; issued_by: string }>;

    expect(inserted).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      expect(inserted[i].test_id).toBe(`test-${i + 1}`);
      expect(inserted[i].token_hash).toBe(sha256(response.body[i].token));
      expect(inserted[i].token_hash).not.toBe(response.body[i].token);
      expect(inserted[i].issued_by).toBe('supervisor@example.com');
    }
  });

  it('reports tampered status from server-side hash check', async () => {
    (getTestHashValidity as jest.Mock).mockReturnValue(false);

    const response = await request(app)
      .post('/api/supervisor/verification-tokens')
      .set('Authorization', 'Bearer valid-token')
      .send({ testIds: ['test-1'] });

    expect(response.status).toBe(201);
    expect(response.body[0].hashStatus).toBe('tampered');
  });

  it('reports unavailable status when no hash exists', async () => {
    (getTestHashValidity as jest.Mock).mockReturnValue(null);

    const response = await request(app)
      .post('/api/supervisor/verification-tokens')
      .set('Authorization', 'Bearer valid-token')
      .send({ testIds: ['test-1'] });

    expect(response.status).toBe(201);
    expect(response.body[0].hashStatus).toBe('unavailable');
  });

  it('rejects empty testIds', async () => {
    const response = await request(app)
      .post('/api/supervisor/verification-tokens')
      .set('Authorization', 'Bearer valid-token')
      .send({ testIds: [] });

    expect(response.status).toBe(400);
  });

  it('rejects oversized batches', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `test-${i}`);
    const response = await request(app)
      .post('/api/supervisor/verification-tokens')
      .set('Authorization', 'Bearer valid-token')
      .send({ testIds: ids });

    expect(response.status).toBe(400);
  });

  it('rejects unknown test ids before issuing any token', async () => {
    const insertSpy = jest.fn().mockResolvedValue({ data: null, error: null });
    mockServiceSupabase.from.mockImplementation((table: string) => {
      if (table === 'admin_users' || table === 'officer_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'supervisor_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [{ supervisor_id: 1, role_id: 2 }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'tests') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [{ id: 'test-1', created_at: '2026-05-30T10:00:00Z' }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'court_verification_tokens') {
        return { insert: insertSpy };
      }
      return {
        select: jest.fn().mockResolvedValue({ data: [], error: null }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const response = await request(app)
      .post('/api/supervisor/verification-tokens')
      .set('Authorization', 'Bearer valid-token')
      .send({ testIds: ['test-1', 'missing-id'] });

    expect(response.status).toBe(404);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('denies non-supervisor roles', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'officer-1', email: 'officer@example.com' } },
      error: null,
    });
    mockServiceSupabase.from.mockImplementation((table: string) => {
      if (table === 'admin_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'officer_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [{ officer_id: 7, role_id: 1 }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: jest.fn().mockResolvedValue({ data: [], error: null }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const response = await request(app)
      .post('/api/supervisor/verification-tokens')
      .set('Authorization', 'Bearer valid-token')
      .send({ testIds: ['test-1'] });

    expect(response.status).toBe(403);
  });

  it('returns 401 without authentication', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const response = await request(app)
      .post('/api/supervisor/verification-tokens')
      .send({ testIds: ['test-1'] });

    expect(response.status).toBe(401);
  });
});
