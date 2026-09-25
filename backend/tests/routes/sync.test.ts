import { Hono } from 'hono';
import request from '../helpers/request';

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
import type { AppEnv } from '../../src/env';

const app = new Hono<AppEnv>();
app.route('/api/sync', syncRoutes);

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

type DeviceOverrides = {
  deviceTransport?: string;
  deviceSerial?: string;
  deviceCalibrationVersion?: string;
  deviceCalibrationR0?: number;
  deviceSessionPeakRaw?: number;
  deviceAvgRaw?: number;
  deviceRaw?: number;
  deviceCapturedAt?: string;
};

function makeSyncRecord(
  overrides: Partial<typeof baseRecord & { hash: string; originalTestId?: string | null } & DeviceOverrides> = {},
  hashOfficer?: { officerId: number; officerName: string; badgeNumber: string }
) {
  const merged = { ...baseRecord, ...overrides };
  const officer = hashOfficer ?? {
    officerId: merged.officerId,
    officerName: merged.officerName,
    badgeNumber: merged.badgeNumber,
  };

  const {
    deviceTransport,
    deviceSerial,
    deviceCalibrationVersion,
    deviceCalibrationR0,
    deviceSessionPeakRaw,
    deviceAvgRaw,
    deviceRaw,
    deviceCapturedAt,
  } = overrides;

  const device = deviceTransport
    ? {
        deviceTransport,
        ...(deviceSerial ? { deviceSerial } : {}),
        deviceCalibrationVersion,
        deviceCalibrationR0,
        deviceSessionPeakRaw,
        deviceAvgRaw,
        deviceRaw,
        deviceCapturedAt,
      }
    : {};

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
    ...device,
  });

  return { ...merged, hash };
}

const validRecord = makeSyncRecord();

const deviceRecord = makeSyncRecord({
  deviceTransport: 'ble',
  deviceSerial: 'MQ3-0042',
  deviceCalibrationVersion: 'mq3-default-v1+clean-air',
  deviceCalibrationR0: 7524.99,
  deviceSessionPeakRaw: 812,
  deviceAvgRaw: 640,
  deviceRaw: 623,
  deviceCapturedAt: '2026-09-21T10:15:00.000Z',
});

const officerProfile = {
  source: 'officer_users' as const,
  dbId: 23,
  profile: {
    uid: 'user-123',
    officerId: 23,
    email: 'officer@example.com',
    name: 'John',
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
            single: jest.fn().mockResolvedValue({ data: { id: 'test-123', hash: validRecord.hash, receipt_number: null }, error: null }),
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

    it('returns a terminal collision when the stored hash differs', async () => {
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'test-123', hash: 'b'.repeat(64), receipt_number: null },
              error: null,
            }),
          }),
        }),
      });

      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer token-123')
        .send({ records: [validRecord] });

      expect(response.status).toBe(200);
      expect(response.body.duplicates).not.toContain('test-123');
      expect(response.body.failed[0]).toMatchObject({
        id: 'test-123',
        code: 'RECORD_ID_COLLISION',
        retryable: false,
      });
    });

    it('returns a terminal conflict when a receipt differs for the same hash', async () => {
      const record = { ...validRecord, receiptNumber: 'IS-20260530-ABCDEF1234567890' };
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'test-123', hash: validRecord.hash, receipt_number: 'IS-20260530-0000000000000000' },
              error: null,
            }),
          }),
        }),
      });

      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer token-123')
        .send({ records: [record] });

      expect(response.status).toBe(200);
      expect(response.body.failed[0]).toMatchObject({ code: 'RECEIPT_MISMATCH', retryable: false });
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
          name: 'John',
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

    it.each(['ble', 'bluetooth_classic'])(
      'should sync device-captured records over %s with custody columns',
      async (transport) => {
        const record = makeSyncRecord({
          deviceTransport: transport,
          deviceSerial: 'MQ3-0042',
          deviceCalibrationVersion: 'mq3-default-v1+clean-air',
          deviceCalibrationR0: 7524.99,
          deviceSessionPeakRaw: 812,
          deviceAvgRaw: 640,
          deviceRaw: 623,
          deviceCapturedAt: '2026-09-21T10:15:00.000Z',
        });
        const insert = jest.fn().mockResolvedValue({ error: null });
        mockServiceSupabase.from
          .mockReturnValueOnce({
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          })
          .mockReturnValueOnce({ insert });

        const response = await request(app)
          .post('/api/sync')
          .set('Authorization', 'Bearer token-123')
          .send({ records: [record] });

        expect(response.status).toBe(200);
        expect(response.body.synced).toContain('test-123');
        expect(response.body.failed).toHaveLength(0);
        expect(insert).toHaveBeenCalledWith([
          expect.objectContaining({
            device_transport: transport,
            device_serial: 'MQ3-0042',
            device_calibration_version: 'mq3-default-v1+clean-air',
            device_calibration_r0: 7524.99,
            device_session_peak_raw: 812,
            device_avg_raw: 640,
            device_raw: 623,
            device_captured_at: '2026-09-21T10:15:00.000Z',
          }),
        ]);
      }
    );

    it('should omit device columns for legacy records without custody data', async () => {
      const insert = jest.fn().mockResolvedValue({ error: null });
      mockServiceSupabase.from
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({ insert });

      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer token-123')
        .send({ records: [validRecord] });

      expect(response.status).toBe(200);
      expect(response.body.synced).toContain('test-123');
      const inserted = insert.mock.calls[0][0][0];
      expect(Object.keys(inserted).some((key) => key.startsWith('device_'))).toBe(false);
    });

    it('should reject records whose device custody fields were altered after capture', async () => {
      const tampered = { ...deviceRecord, deviceSessionPeakRaw: 300 };

      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer token-123')
        .send({ records: [tampered] });

      expect(response.status).toBe(200);
      expect(response.body.failed).toHaveLength(1);
      expect(response.body.failed[0].error).toContain('Hash verification failed');
    });

    it('should reject malformed device custody fields', async () => {
      const invalid = makeSyncRecord({
        deviceTransport: 'wifi',
        deviceCalibrationVersion: 'mq3-default-v1',
        deviceCalibrationR0: 7532,
        deviceSessionPeakRaw: 9000,
        deviceAvgRaw: 640,
        deviceRaw: 623,
        deviceCapturedAt: '2026-09-21T10:15:00.000Z',
      });

      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer token-123')
        .send({ records: [invalid] });

      expect(response.status).toBe(200);
      expect(response.body.failed).toHaveLength(1);
      expect(response.body.failed[0].error).toBe('Invalid device custody fields');
    });
  });
});
