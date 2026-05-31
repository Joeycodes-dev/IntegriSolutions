import request from 'supertest';
import express from 'express';

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

import syncRoutes from '../../src/routes/sync';
import { supabase } from '../../src/supabase';

const app = express();
app.use(express.json());
app.use('/api/sync', syncRoutes);

const validRecord = {
  id: 'test-123',
  officerId: 1,
  officerName: 'John Doe',
  badgeNumber: '12345',
  driverName: 'Jane Smith',
  driverId: '9876543210123',
  driverDob: '1990-01-01',
  bacReading: 0.08,
  result: 'fail',
  location: { lat: -26.2041, lng: 28.0473 },
  hash: 'a1b2c3d4e5f6',
  createdAt: '2026-05-30T10:00:00Z',
};

describe('Sync Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-123', email: 'officer@example.com' } },
      error: null,
    });
  });

  describe('POST /api/sync', () => {
    it('should return 400 when records array is missing', async () => {
      const response = await request(app)
        .post('/api/sync')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Records array is required and must not be empty');
    });

    it('should return 400 when records array is empty', async () => {
      const response = await request(app)
        .post('/api/sync')
        .send({ records: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Records array is required and must not be empty');
    });

    it('should return 400 when batch size exceeds 50', async () => {
      const records = Array(51).fill(validRecord);
      const response = await request(app)
        .post('/api/sync')
        .send({ records });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Batch size cannot exceed 50 records');
    });

    it('should detect and skip duplicate records', async () => {
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: { id: 'test-123' }, error: null }),
          }),
        }),
      });

      const response = await request(app)
        .post('/api/sync')
        .send({ records: [validRecord] });

      expect(response.status).toBe(200);
      expect(response.body.duplicates).toContain('test-123');
      expect(response.body.synced).toHaveLength(0);
    });

    it('should successfully sync valid records', async () => {
      mockServiceSupabase.from
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          insert: jest.fn().mockResolvedValue({ error: null }),
        });

      const response = await request(app)
        .post('/api/sync')
        .send({ records: [validRecord] });

      expect(response.status).toBe(200);
      expect(response.body.synced).toContain('test-123');
      expect(response.body.failed).toHaveLength(0);
    });

    it('should handle records with missing required fields', async () => {
      const invalidRecord = { ...validRecord, id: undefined };
      
      const response = await request(app)
        .post('/api/sync')
        .send({ records: [invalidRecord] });

      expect(response.status).toBe(200);
      expect(response.body.failed).toHaveLength(1);
      expect(response.body.failed[0].error).toBe('Missing or invalid fields');
    });

    it('should handle database insert errors', async () => {
      mockServiceSupabase.from
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          insert: jest.fn().mockResolvedValue({ error: { message: 'Database error' } }),
        });

      const response = await request(app)
        .post('/api/sync')
        .send({ records: [validRecord] });

      expect(response.status).toBe(200);
      expect(response.body.failed).toHaveLength(1);
      expect(response.body.failed[0].error).toBe('Database error');
    });
  });
});
