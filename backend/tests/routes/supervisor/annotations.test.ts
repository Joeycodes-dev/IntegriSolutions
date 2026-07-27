import request from 'supertest';
import express from 'express';

const mockServiceSupabase = {
  from: jest.fn(),
};

jest.mock('../../../src/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
  },
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockServiceSupabase),
}));

jest.mock('../../../src/utilities/auditLog', () => ({
  writeAuditLog: jest.fn(),
}));

import annotationsRoutes from '../../../src/routes/supervisor/annotations';
import { supabase } from '../../../src/supabase';

const app = express();
app.use(express.json());
app.use('/api/supervisor/tests', annotationsRoutes);

describe('Annotations Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock supervisor authentication
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'supervisor-123', email: 'supervisor@example.com' } },
      error: null,
    });

    mockServiceSupabase.from.mockImplementation((table: string) => {
      if (table === 'officer_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [{ officer_id: 1, role_id: 2 }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'annotations') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: [{ id: 1, test_id: 'test-123', status: 'approved' }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'tests') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [{ id: 'test-123' }],
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
  });

  describe('GET /api/supervisor/tests/:testId', () => {
    it('should return annotations for a test', async () => {
      const response = await request(app)
        .get('/api/supervisor/tests/test-123')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const response = await request(app)
        .get('/api/supervisor/tests/test-123');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/supervisor/tests/:testId', () => {
    it('should return 400 when status is missing', async () => {
      const response = await request(app)
        .post('/api/supervisor/tests/test-123')
        .set('Authorization', 'Bearer valid-token')
        .send({ comment: 'Test comment' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Status must be one of: pending, approved, referred');
    });

    it('should return 400 when status is invalid', async () => {
      const response = await request(app)
        .post('/api/supervisor/tests/test-123')
        .set('Authorization', 'Bearer valid-token')
        .send({ status: 'invalid-status', comment: 'Test comment' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Status must be one of: pending, approved, referred');
    });

    it('should return 404 when test does not exist', async () => {
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'officer_users') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [{ officer_id: 1, role_id: 2 }],
                  error: null,
                }),
              }),
            }),
          };
        }
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
        .post('/api/supervisor/tests/non-existent')
        .set('Authorization', 'Bearer valid-token')
        .send({ status: 'approved', comment: 'Test comment' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Test record not found');
    });

    it('should create annotation successfully', async () => {
      const response = await request(app)
        .post('/api/supervisor/tests/test-123')
        .set('Authorization', 'Bearer valid-token')
        .send({ status: 'approved', comment: 'Verified and approved' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('test_id', 'test-123');
    });
  });
});
