import { Hono } from 'hono';
import request from '../helpers/request';

const mockServiceSupabase = {
  from: jest.fn(),
  storage: {
    from: jest.fn(),
  },
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

jest.mock('../../src/middleware/auth', () => ({
  requireAuth: async (c: any, next: any) => {
    c.set('userEmail', 'officer@example.com');
    c.set('userId', 'officer-123');
    await next();
  },
  AuthRequest: {},
}));

jest.mock('../../src/utilities/auditLog', () => ({
  writeAuditLog: jest.fn(),
}));

import evidenceRoutes from '../../src/routes/evidence';
import type { AppEnv } from '../../src/env';

const app = new Hono<AppEnv>();
app.route('/api/evidence', evidenceRoutes);

const INTEGRITY_KEY = 'evidence-test-photo-1';
const BYTES_HASH = '277089d91c0bdf4f2e6862ba7e4a07605119431f5d13f726dd352b06f1b206a9';
let existingEvidenceRow: Record<string, unknown> | null = null;

describe('Evidence Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    existingEvidenceRow = null;

    mockServiceSupabase.storage.from.mockReturnValue({
      upload: jest.fn().mockResolvedValue({ error: null }),
      getPublicUrl: jest.fn().mockReturnValue({
        data: { publicUrl: 'https://supabase.example/storage/v1/object/public/evidence/test-1/vehicle-1.jpg' },
      }),
      remove: jest.fn().mockResolvedValue({ error: null }),
    });

    mockServiceSupabase.from.mockImplementation((table: string) => {
      if (table === 'tests') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [{ id: 'test-1' }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'evidence') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: existingEvidenceRow ? [existingEvidenceRow] : [], error: null }),
              }),
            }),
          }),
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: [{
                id: 1,
                test_id: 'test-1',
                photo_url: 'https://supabase.example/photo.jpg',
                notes: null,
                uploaded_by: 'officer@example.com',
                category: 'vehicle',
                created_at: '2026-08-01T10:00:00Z',
              }],
              error: null,
            }),
          }),
        };
      }
      return {
        select: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
  });

  describe('POST /api/evidence/:testId', () => {
    function captureEvidenceInsert() {
      const fromMock = mockServiceSupabase.from as jest.Mock;
      const evidenceCall = fromMock.mock.calls.find((args) => args[0] === 'evidence');
      const evidenceResults = fromMock.mock.results.filter(
        (_result, index) => fromMock.mock.calls[index]?.[0] === 'evidence'
      );
      const branch = evidenceResults[evidenceResults.length - 1];
      const insertMock = (branch?.value as { insert?: unknown } | undefined)?.insert;
      return insertMock as jest.Mock | undefined;
    }

    it('requires both an idempotency key and a content hash', async () => {
      const response = await request(app)
        .post('/api/evidence/test-1')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', Buffer.from('bytes'), 'photo.jpg');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Idempotency-Key');
    });

    it('rejects a claimed hash that does not match the uploaded bytes', async () => {
      const response = await request(app)
        .post('/api/evidence/test-1')
        .set('Authorization', 'Bearer valid-token')
        .set('Idempotency-Key', INTEGRITY_KEY)
        .set('X-Content-SHA256', 'a'.repeat(64))
        .attach('photo', Buffer.from('bytes'), 'photo.jpg');

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('does not match');
    });

    it('uploads a photo with the default category when none is supplied', async () => {
      const response = await request(app)
        .post('/api/evidence/test-1')
        .set('Authorization', 'Bearer valid-token')
        .set('Idempotency-Key', INTEGRITY_KEY)
        .set('X-Content-SHA256', BYTES_HASH)
        .attach('photo', Buffer.from('bytes'), 'photo.jpg');

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('category', 'vehicle');

      const insertMock = captureEvidenceInsert();
      expect(insertMock).toBeDefined();
      expect(insertMock).toHaveBeenCalledWith([
        expect.objectContaining({
          test_id: 'test-1',
          category: 'vehicle',
        }),
      ]);
    });

    it('stores a categorized photo when category is supplied', async () => {
      const response = await request(app)
        .post('/api/evidence/test-1')
        .set('Authorization', 'Bearer valid-token')
        .set('Idempotency-Key', INTEGRITY_KEY)
        .set('X-Content-SHA256', BYTES_HASH)
        .field('category', 'licence_front')
        .attach('photo', Buffer.from('bytes'), 'photo.jpg');

      expect(response.status).toBe(201);
      const insertMock = captureEvidenceInsert();
      expect(insertMock).toHaveBeenCalledWith([
        expect.objectContaining({
          test_id: 'test-1',
          category: 'licence_front',
        }),
      ]);
    });

    it('replays the same key and bytes without inserting a second row', async () => {
      existingEvidenceRow = {
        id: 7,
        test_id: 'test-1',
        category: 'vehicle',
        notes: null,
        content_hash: BYTES_HASH,
        idempotency_key: INTEGRITY_KEY,
        photo_url: 'https://supabase.example/photo.jpg',
      };

      const response = await request(app)
        .post('/api/evidence/test-1')
        .set('Authorization', 'Bearer valid-token')
        .set('Idempotency-Key', INTEGRITY_KEY)
        .set('X-Content-SHA256', BYTES_HASH)
        .attach('photo', Buffer.from('bytes'), 'photo.jpg');

      expect(response.status).toBe(200);
      expect(response.body.duplicate).toBe(true);
      expect(captureEvidenceInsert()).toBeDefined();
      expect(mockServiceSupabase.storage.from().upload).not.toHaveBeenCalled();
    });

    it('rejects reuse of a key with different bytes', async () => {
      existingEvidenceRow = {
        id: 7,
        test_id: 'test-1',
        category: 'vehicle',
        notes: null,
        content_hash: 'b'.repeat(64),
        idempotency_key: INTEGRITY_KEY,
      };

      const response = await request(app)
        .post('/api/evidence/test-1')
        .set('Authorization', 'Bearer valid-token')
        .set('Idempotency-Key', INTEGRITY_KEY)
        .set('X-Content-SHA256', BYTES_HASH)
        .attach('photo', Buffer.from('bytes'), 'photo.jpg');

      expect(response.status).toBe(409);
      expect(mockServiceSupabase.storage.from().upload).not.toHaveBeenCalled();
    });

    it('rejects an invalid category', async () => {
      const response = await request(app)
        .post('/api/evidence/test-1')
        .set('Authorization', 'Bearer valid-token')
        .set('Idempotency-Key', INTEGRITY_KEY)
        .set('X-Content-SHA256', BYTES_HASH)
        .field('category', 'selfie')
        .attach('photo', Buffer.from('bytes'), 'photo.jpg');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid evidence category');
      expect(captureEvidenceInsert()).toBeUndefined();
    });

    it('returns 404 when the test does not exist', async () => {
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'tests') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const response = await request(app)
        .post('/api/evidence/non-existent')
        .set('Authorization', 'Bearer valid-token')
        .set('Idempotency-Key', INTEGRITY_KEY)
        .set('X-Content-SHA256', BYTES_HASH)
        .attach('photo', Buffer.from('bytes'), 'photo.jpg');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Test record not found');
    });
  });

  describe('GET /api/evidence/:testId', () => {
    it('returns evidence rows for a test', async () => {
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'evidence') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: [{ id: 1, test_id: 'test-1', category: 'vehicle', photo_url: 'x' }],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const response = await request(app)
        .get('/api/evidence/test-1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('category', 'vehicle');
    });
  });
});
