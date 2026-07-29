import request from 'supertest';
import express from 'express';

const mockServiceSupabase = {
  from: jest.fn(),
};
const mockResolveProfileByEmail = jest.fn();

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

jest.mock('../../src/utilities/resolveProfile', () => ({
  resolveProfileByEmail: mockResolveProfileByEmail,
}));

import syncRoutes from '../../src/routes/sync';
import { supabase } from '../../src/supabase';
import { hashData } from '../../src/utilities/hash';

const app = express();
app.use(express.json());
app.use('/api/sync', syncRoutes);

const baseRecord = {
  id: 'test-123',
  officerId: 23,
  officerName: 'John Doe',
  badgeNumber: '12345',
  driverName: 'Jane Smith',
  driverId: '9876543210123',
  driverDob: '1990-01-01',
  bacReading: 0.08,
  result: 'fail',
  location: { lat: -26.2041, lng: 28.0473 },
  createdAt: '2026-05-30T10:00:00Z',
};

function makeSyncRecord(
  overrides: Partial<typeof baseRecord & { hash: string; originalTestId?: string | null }> = {},
  hashOfficer?: { officerId: number; officerName: string; badgeNumber: string }
) {
  const merged = { ...baseRecord, ...overrides };
  const officer = hashOfficer ?? {
    officerId: merged.officerId,
    officerName: merged.officerName,
    badgeNumber: merged.badgeNumber,
  };

  const hash = overrides.hash ?? hashData({
    officerId: officer.officerId,
    officerName: officer.officerName,
    badgeNumber: officer.badgeNumber,
    driverName: merged.driverName,
    driverId: merged.driverId,
    driverDob: merged.driverDob,
    bacReading: merged.bacReading,
    result: merged.result,
    location: merged.location,
    createdAt: merged.createdAt,
    originalTestId: overrides.originalTestId ?? null,
  });

  return { ...merged, hash };
}

const validRecord = makeSyncRecord();

const officerProfile = {
  source: 'officer_users' as const,
  dbId: 23,
  profile: {
    uid: 'user-123',
    officerId: 23,
    email: 'officer@example.com',
    name: 'John Doe',
    surname: 'Doe',
    badgeNumber: '12345',
    idNumber: '9001015009087',
    employmentStatus: 'Active',
    province: 'Gauteng',
    region: 'Tshwane',
    officerTypeId: 1,
    roleId: 1,
    createdAt: '2026-05-30T09:00:00Z',
  },
};

describe('Sync Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-123', email: 'officer@example.com' } },
      error: null,
    });
    mockResolveProfileByEmail.mockResolvedValue(officerProfile);
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
        .set('Authorization', 'Bearer token-123')
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
        .set('Authorization', 'Bearer token-123')
        .send({ records: [validRecord] });

      expect(response.status).toBe(200);
      expect(response.body.synced).toContain('test-123');
      expect(response.body.failed).toHaveLength(0);
    });

    it('should use the authenticated officer profile instead of stale local officer ids', async () => {
      const insert = jest.fn().mockResolvedValue({ error: null });
      mockResolveProfileByEmail.mockResolvedValue({
        source: 'officer_users',
        dbId: 1,
        profile: {
          uid: 'user-123',
          officerId: 1,
          email: 'officer@example.com',
          name: 'John Doe',
          surname: 'Doe',
          badgeNumber: '12345',
          idNumber: '9001015009087',
          employmentStatus: 'Active',
          province: 'Gauteng',
          region: 'Tshwane',
          officerTypeId: 1,
          roleId: 1,
          createdAt: '2026-05-30T09:00:00Z',
        },
      });
      mockServiceSupabase.from
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({ insert });

      const staleRecord = makeSyncRecord(
        { officerId: 999, officerName: 'Stale Officer', badgeNumber: 'OLD' },
        { officerId: 1, officerName: 'John Doe', badgeNumber: '12345' }
      );

      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer token-123')
        .send({ records: [staleRecord] });

      expect(response.status).toBe(200);
      expect(response.body.synced).toContain('test-123');
      expect(response.body.failed).toHaveLength(0);
      expect(mockResolveProfileByEmail).toHaveBeenCalledWith('officer@example.com', 'user-123');
      expect(insert).toHaveBeenCalledWith([
        expect.objectContaining({
          officer_id: 1,
          officer_name: 'John Doe',
          badge_number: '12345',
        }),
      ]);
    });

    it('should handle records with missing required fields', async () => {
      const invalidRecord = { ...validRecord, id: undefined as unknown as string };

      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer token-123')
        .send({ records: [invalidRecord] });

      expect(response.status).toBe(200);
      expect(response.body.failed).toHaveLength(1);
      expect(response.body.failed[0].error).toBe('Missing or invalid fields');
    });

    it('should return 401 without officer authentication', async () => {
      const response = await request(app)
        .post('/api/sync')
        .send({ records: [validRecord] });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Officer authentication required');
    });

    it('should reject records with tampered hashes', async () => {
      const tampered = makeSyncRecord({ hash: hashData({ tampered: true }) });

      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer token-123')
        .send({ records: [tampered] });

      expect(response.status).toBe(200);
      expect(response.body.failed).toHaveLength(1);
      expect(response.body.failed[0].error).toContain('Hash verification failed');
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
        .set('Authorization', 'Bearer token-123')
        .send({ records: [validRecord] });

      expect(response.status).toBe(200);
      expect(response.body.failed).toHaveLength(1);
      expect(response.body.failed[0].error).toBe('Database error');
    });
  });
});
