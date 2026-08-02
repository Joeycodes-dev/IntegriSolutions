import request from 'supertest';
import express from 'express';

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
  requireAuth: (req: any, _res: any, next: any) => {
    req.userEmail = 'officer@example.com';
    req.userId = 'officer-123';
    next();
  },
  AuthRequest: {},
}));

jest.mock('../../src/utilities/auditLog', () => ({
  writeAuditLog: jest.fn(),
}));

jest.mock('multer', () => {
  const parseFormData = (req: any): Promise<void> =>
    new Promise((resolve) => {
      if (!req.body) req.body = {};
      const contentType = String(req.headers?.['content-type'] ?? '');
      if (!contentType.includes('multipart/form-data')) {
        resolve();
        return;
      }
      const boundaryMatch = /boundary=(.+)$/.exec(contentType);
      const boundary = boundaryMatch ? boundaryMatch[1].replace(/^"|"$/g, '') : null;
      if (!boundary) {
        resolve();
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const fieldPattern = new RegExp(
          `--${boundary}\\r\\nContent-Disposition: form-data; name="([^"]+)"\\r\\n\\r\\n([^\\r\\n]*)`,
          'g'
        );
        let match: RegExpExecArray | null;
        while ((match = fieldPattern.exec(raw))) {
          req.body[match[1]] = match[2];
        }
        resolve();
      });
    });

  const single = () => async (req: any, _res: any, next: any) => {
    await parseFormData(req);
    req.file = {
      buffer: Buffer.from('fake-image-bytes'),
      mimetype: 'image/jpeg',
      originalname: 'photo.jpg',
    };
    next();
  };
  const memoryStorage = () => ({});
  return Object.assign(() => ({ single, memoryStorage }), { memoryStorage, single });
});

import evidenceRoutes from '../../src/routes/evidence';

const app = express();
app.use(express.json());
app.use('/api/evidence', evidenceRoutes);

describe('Evidence Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

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
      const branch = fromMock.mock.results.find(
        (result, index) => fromMock.mock.calls[index]?.[0] === 'evidence'
      );
      const insertMock = (branch?.value as { insert?: unknown } | undefined)?.insert;
      return insertMock as jest.Mock | undefined;
    }

    it('uploads a photo with the default category when none is supplied', async () => {
      const response = await request(app)
        .post('/api/evidence/test-1')
        .set('Authorization', 'Bearer valid-token')
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

    it('falls back to vehicle for an invalid category', async () => {
      const response = await request(app)
        .post('/api/evidence/test-1')
        .set('Authorization', 'Bearer valid-token')
        .field('category', 'selfie')
        .attach('photo', Buffer.from('bytes'), 'photo.jpg');

      expect(response.status).toBe(201);
      const insertMock = captureEvidenceInsert();
      expect(insertMock).toHaveBeenCalledWith([
        expect.objectContaining({ category: 'vehicle' }),
      ]);
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
