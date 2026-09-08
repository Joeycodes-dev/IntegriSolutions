import request from 'supertest';
import express from 'express';

const mockServiceSupabase: any = {
  from: jest.fn(),
  storage: {
    from: jest.fn(),
  },
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
  resolveProfileByEmail: (...args: any[]) => mockResolveProfileByEmail(...args),
}));

import roadOffencesRoutes from '../../src/routes/roadOffences';
import { supabase } from '../../src/supabase';

const app = express();
app.use(express.json());
app.use('/api/road-offences', roadOffencesRoutes);
// Surface multer / route errors as JSON so tests get deterministic bodies.
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(500).json({ error: err?.message ?? 'Internal server error' });
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
    badgeNumber: 'B123',
    idNumber: '9001015009087',
    employmentStatus: 'Active',
    province: 'Gauteng',
    region: 'Tshwane',
    officerTypeId: 1,
    roleId: 1,
    createdAt: '2026-05-30T09:00:00Z',
  },
};

const supervisorProfile = {
  source: 'supervisor_users' as const,
  dbId: 7,
  profile: {
    uid: 'sup-123',
    officerId: 7,
    email: 'supervisor@example.com',
    name: 'Sara',
    surname: 'Super',
    badgeNumber: 'S001',
    idNumber: '8001015009087',
    employmentStatus: 'Active',
    province: 'Gauteng',
    region: 'Joburg',
    officerTypeId: 1,
    roleId: 2,
    createdAt: '2026-05-30T09:00:00Z',
  },
};

const adminProfile = {
  source: 'admin_users' as const,
  dbId: 9,
  profile: {
    uid: 'admin-123',
    officerId: 9,
    email: 'admin@example.com',
    name: 'Ada',
    surname: 'Admin',
    badgeNumber: 'A001',
    idNumber: '7001015009087',
    employmentStatus: 'Active',
    province: 'Gauteng',
    region: 'Joburg',
    officerTypeId: 1,
    roleId: 3,
    createdAt: '2026-05-30T09:00:00Z',
  },
};

function validOffencePayload(overrides: Record<string, any> = {}) {
  return {
    id: 'off-123',
    offenceType: 'speeding',
    actionTaken: 'fine_or_notice',
    notes: 'Clocked at 140 in a 120 zone',
    location: { lat: -26.2041, lng: 28.0473 },
    driverName: 'Driver A',
    driverIdentifier: 'DL001',
    vehicleRegistration: 'ABC123GP',
    vehicleDescription: 'White Toyota',
    referenceNumber: 'REF-1',
    ...overrides,
  };
}

function mockAuthAs(email = 'officer@example.com', id = 'user-123') {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id, email } },
    error: null,
  });
}

describe('Road Offences Routes (new feature)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthAs();
    mockResolveProfileByEmail.mockResolvedValue(officerProfile);
    mockServiceSupabase.storage.from.mockReturnValue({
      upload: jest.fn().mockResolvedValue({ error: null }),
      getPublicUrl: jest.fn().mockReturnValue({
        data: { publicUrl: 'https://supabase.example/storage/evidence/photo.jpg' },
      }),
    });
  });

  describe('POST /api/road-offences', () => {
    function mockInsertSuccess(inserted: any = { id: 'off-123' }) {
      const insertMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: inserted, error: null }),
        }),
      });
      (mockInsertSuccess as any).lastInsert = insertMock;
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'road_offences') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: insertMock,
          };
        }
        return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
      });
    }

    it('creates a road offence for an officer with a hashed immutable record', async () => {
      mockInsertSuccess({ id: 'off-123', offence_type: 'speeding', hash: 'some-hash' });

      const res = await request(app)
        .post('/api/road-offences')
        .set('Authorization', 'Bearer valid-token')
        .send(validOffencePayload());

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 'off-123' });

      const insertMock: jest.Mock = (mockInsertSuccess as any).lastInsert;
      expect(insertMock).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'off-123',
          officer_id: 23,
          officer_name: 'John Doe',
          badge_number: 'B123',
          offence_type: 'speeding',
          action_taken: 'fine_or_notice',
          hash: expect.any(String),
        }),
      ]);
      // Hash must be populated (WORM integrity).
      const sent = insertMock.mock.calls[0][0][0];
      expect(sent.hash).toBeTruthy();
      expect(typeof sent.hash).toBe('string');
    });

    it('returns 400 for missing/invalid payload fields', async () => {
      const cases = [
        [{}, 'empty body'],
        [validOffencePayload({ id: '' }), 'missing id'],
        [validOffencePayload({ offenceType: 'jaywalking' }), 'invalid offenceType'],
        [validOffencePayload({ actionTaken: 'teleport' }), 'invalid actionTaken'],
        [validOffencePayload({ notes: '   ' }), 'blank notes'],
        [validOffencePayload({ location: undefined }), 'missing location'],
        [validOffencePayload({ location: 'JHB' }), 'non-object location'],
      ] as const;

      for (const [body, label] of cases) {
        const res = await request(app)
          .post('/api/road-offences')
          .set('Authorization', 'Bearer valid-token')
          .send(body);
        expect(res.status).toBe(400, label);
        expect(res.body.error).toBe('Missing or invalid road offence payload');
      }
    });

    it('returns 403 when a supervisor tries to submit (officers only)', async () => {
      mockAuthAs('supervisor@example.com', 'sup-123');
      mockResolveProfileByEmail.mockResolvedValue(supervisorProfile);

      const res = await request(app)
        .post('/api/road-offences')
        .set('Authorization', 'Bearer valid-token')
        .send(validOffencePayload());

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Only officer accounts can submit road offences');
    });

    it('returns 409 on duplicate submit (same client-generated id)', async () => {
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'off-123' }, error: null }),
          }),
        }),
      });

      const res = await request(app)
        .post('/api/road-offences')
        .set('Authorization', 'Bearer valid-token')
        .send(validOffencePayload());

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Road offence already submitted');
    });

    it('returns 500 when the insert fails', async () => {
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'road_offences') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } }),
              }),
            }),
          };
        }
        return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const res = await request(app)
        .post('/api/road-offences')
        .set('Authorization', 'Bearer valid-token')
        .send(validOffencePayload());

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB down');
    });

    it('returns 401 without authentication', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const res = await request(app).post('/api/road-offences').send(validOffencePayload());
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/road-offences', () => {
    function mockList(rows: any[] = []) {
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'road_offences') {
          return {
            select: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: rows, error: null }),
            }),
          };
        }
        return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
      });
    }

    it('allows supervisors to list offences with reviews + evidence', async () => {
      mockAuthAs('supervisor@example.com', 'sup-123');
      mockResolveProfileByEmail.mockResolvedValue(supervisorProfile);
      const rows = [
        { id: 'off-1', offence_type: 'speeding', road_offence_reviews: [], road_offence_evidence: [] },
      ];
      mockList(rows);

      const res = await request(app).get('/api/road-offences').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(rows);
      expect(mockServiceSupabase.from).toHaveBeenCalledWith('road_offences');
    });

    it('allows admins to list offences', async () => {
      mockAuthAs('admin@example.com', 'admin-123');
      mockResolveProfileByEmail.mockResolvedValue(adminProfile);
      mockList([]);

      const res = await request(app).get('/api/road-offences').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns 403 for officers (review is supervisor/admin only)', async () => {
      mockResolveProfileByEmail.mockResolvedValue(officerProfile);

      const res = await request(app).get('/api/road-offences').set('Authorization', 'Bearer t');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Only supervisor or administrator accounts can review road offences');
    });

    it('returns 500 when the list query fails', async () => {
      mockAuthAs('supervisor@example.com', 'sup-123');
      mockResolveProfileByEmail.mockResolvedValue(supervisorProfile);
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } }),
        }),
      });

      const res = await request(app).get('/api/road-offences').set('Authorization', 'Bearer t');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB down');
    });
  });

  describe('POST /api/road-offences/:id/reviews', () => {
    function mockReviewInsert(row: any = { id: 1, action: 'verified' }) {
      mockServiceSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: row, error: null }),
          }),
        }),
      });
    }

    beforeEach(() => {
      mockAuthAs('supervisor@example.com', 'sup-123');
      mockResolveProfileByEmail.mockResolvedValue(supervisorProfile);
    });

    it('records a supervisor review with action + reason', async () => {
      mockReviewInsert({ id: 5, road_offence_id: 'off-123', action: 'verified', reason: 'Confirmed' });

      const res = await request(app)
        .post('/api/road-offences/off-123/reviews')
        .set('Authorization', 'Bearer t')
        .send({ action: 'verified', reason: 'Confirmed via CCTV' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ action: 'verified' });

      const insertMock = mockServiceSupabase.from.mock.results[0].value.insert as jest.Mock;
      expect(insertMock).toHaveBeenCalledWith([
        expect.objectContaining({
          road_offence_id: 'off-123',
          reviewer_source: 'supervisor_users',
          reviewer_id: 7,
          reviewer_name: 'Sara Super',
          action: 'verified',
          reason: 'Confirmed via CCTV',
        }),
      ]);
    });

    it.each(['verified', 'correction_requested', 'referred', 'closed'])(
      'accepts review action %s',
      async (action) => {
        mockReviewInsert({ id: 1, action });
        const res = await request(app)
          .post('/api/road-offences/off-123/reviews')
          .set('Authorization', 'Bearer t')
          .send({ action, reason: 'ok' });
        expect(res.status).toBe(201);
      }
    );

    it('returns 400 for invalid action or blank reason', async () => {
      for (const body of [{ action: 'bogus', reason: 'x' }, { action: 'verified', reason: '' }, { action: 'verified' }, {}]) {
        const res = await request(app)
          .post('/api/road-offences/off-123/reviews')
          .set('Authorization', 'Bearer t')
          .send(body);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('A valid review action and reason are required');
      }
    });

    it('returns 403 when an officer tries to review', async () => {
      mockAuthAs();
      mockResolveProfileByEmail.mockResolvedValue(officerProfile);

      const res = await request(app)
        .post('/api/road-offences/off-123/reviews')
        .set('Authorization', 'Bearer t')
        .send({ action: 'verified', reason: 'ok' });

      expect(res.status).toBe(403);
    });

    it('returns 500 when the review insert fails', async () => {
      mockServiceSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { message: 'FK violation' } }),
          }),
        }),
      });

      const res = await request(app)
        .post('/api/road-offences/off-123/reviews')
        .set('Authorization', 'Bearer t')
        .send({ action: 'verified', reason: 'ok' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('FK violation');
    });
  });

  describe('POST /api/road-offences/:id/evidence', () => {
    function mockOffenceLookup(offence: any) {
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'road_offences') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: offence, error: null }),
              }),
            }),
          };
        }
        if (table === 'road_offence_evidence') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 1, road_offence_id: 'off-123', storage_path: 'p', storage_url: 'u' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
      });
    }

    it('uploads photos for your own offence and returns stored rows', async () => {
      mockOffenceLookup({ id: 'off-123', officer_id: 23 });
      mockResolveProfileByEmail.mockResolvedValue(officerProfile);

      const res = await request(app)
        .post('/api/road-offences/off-123/evidence')
        .set('Authorization', 'Bearer t')
        .attach('photos', Buffer.from('fake-bytes'), 'scene.jpg');

      expect(res.status).toBe(201);
      expect(res.body.photos).toHaveLength(1);
      expect(res.body.photos[0]).toHaveProperty('road_offence_id', 'off-123');
      expect(mockServiceSupabase.storage.from).toHaveBeenCalledWith('evidence');
    });

    it('returns 404 when the offence does not exist', async () => {
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });

      const res = await request(app)
        .post('/api/road-offences/missing/evidence')
        .set('Authorization', 'Bearer t')
        .attach('photos', Buffer.from('x'), 'scene.jpg');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Road offence not found');
    });

    it('returns 403 when uploading to another officer’s offence', async () => {
      mockOffenceLookup({ id: 'off-123', officer_id: 999 });

      const res = await request(app)
        .post('/api/road-offences/off-123/evidence')
        .set('Authorization', 'Bearer t')
        .attach('photos', Buffer.from('x'), 'scene.jpg');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You can only upload evidence for your own road offences');
    });

    it('returns 403 when a supervisor tries to upload (officers only)', async () => {
      mockAuthAs('supervisor@example.com', 'sup-123');
      mockResolveProfileByEmail.mockResolvedValue(supervisorProfile);

      const res = await request(app)
        .post('/api/road-offences/off-123/evidence')
        .set('Authorization', 'Bearer t')
        .attach('photos', Buffer.from('x'), 'scene.jpg');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Only officer accounts can upload road offence evidence');
    });

    it('returns 400 when no photos are attached', async () => {
      mockOffenceLookup({ id: 'off-123', officer_id: 23 });

      const res = await request(app)
        .post('/api/road-offences/off-123/evidence')
        .set('Authorization', 'Bearer t')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('At least one photo is required');
    });

    it('returns 500 when storage upload fails', async () => {
      mockOffenceLookup({ id: 'off-123', officer_id: 23 });
      mockServiceSupabase.storage.from.mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: { message: 'bucket full' } }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'u' } }),
      });

      const res = await request(app)
        .post('/api/road-offences/off-123/evidence')
        .set('Authorization', 'Bearer t')
        .attach('photos', Buffer.from('x'), 'scene.jpg');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Evidence storage upload failed');
    });
  });
});
