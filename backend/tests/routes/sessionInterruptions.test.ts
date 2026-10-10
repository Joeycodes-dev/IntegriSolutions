import { Hono } from 'hono';
import request from '../helpers/request';

const mockServiceSupabase: any = {
  from: jest.fn(),
};
const mockResolveProfileByEmail = jest.fn();
const mockResolveRoleByEmail = jest.fn();

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
  resolveRoleByEmail: (...args: any[]) => mockResolveRoleByEmail(...args),
}));

import sessionInterruptionRoutes from '../../src/routes/sessionInterruptions';
import { supabase } from '../../src/supabase';
import type { AppEnv } from '../../src/env';

const app = new Hono<AppEnv>();
app.route('/api', sessionInterruptionRoutes);

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

function mockAuthAs(email = 'officer@example.com', id = 'user-123') {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id, email } },
    error: null,
  });
}

function validPayload(overrides: Record<string, any> = {}) {
  return {
    id: 'int-123',
    draftId: 'draft-abc',
    plannedTestId: 'test-xyz',
    step: 'scan',
    kind: 'cancelled',
    reason: 'Driver refused the breathalyzer test',
    occurredAt: '2026-10-10T10:15:00.000Z',
    ...overrides,
  };
}

/** Mocks the test_session_interruptions table for POST (dup-check + insert). */
function mockPostTable(existing: { id: string } | null = null) {
  const insertMock = jest.fn().mockResolvedValue({ error: null });
  mockServiceSupabase.from.mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: existing, error: null }),
      }),
    }),
    insert: insertMock,
  });
  return insertMock;
}

/** Mocks the table for GET: a thenable chain (order/limit/eq all chainable). */
function mockGetTable(rows: any[]) {
  const eqMock = jest.fn();
  const builder: any = {
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    eq: jest.fn((...args: any[]) => {
      eqMock(...args);
      return builder;
    }),
    then: (resolve: (value: { data: any[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  };
  mockServiceSupabase.from.mockReturnValue({
    select: jest.fn(() => builder),
  });
  return { eqMock };
}

describe('Session Interruptions Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthAs();
    mockResolveProfileByEmail.mockResolvedValue(officerProfile);
    mockResolveRoleByEmail.mockResolvedValue({ roleId: 2, dbId: 7 });
  });

  describe('POST /api/officers/session-interruptions', () => {
    it('creates an interruption for an officer', async () => {
      const insertMock = mockPostTable();

      const res = await request(app)
        .post('/api/officers/session-interruptions')
        .set('Authorization', 'Bearer valid-token')
        .send(validPayload());

      expect(res.status).toBe(201);
      expect(insertMock).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'int-123',
          officer_id: 23,
          officer_name: 'John Doe',
          badge_number: 'B123',
          draft_id: 'draft-abc',
          planned_test_id: 'test-xyz',
          step: 'scan',
          kind: 'cancelled',
          reason: 'Driver refused the breathalyzer test',
          occurred_at: '2026-10-10T10:15:00.000Z',
        }),
      ]);
    });

    it('requires a reason when cancelling or leaving a session', async () => {
      mockPostTable();

      for (const kind of ['cancelled', 'navigated_away'] as const) {
        const res = await request(app)
          .post('/api/officers/session-interruptions')
          .set('Authorization', 'Bearer valid-token')
          .send(validPayload({ kind, reason: '   ' }));

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('A reason is required when cancelling or leaving a test session');
      }
    });

    it('allows app_closed without a reason', async () => {
      const insertMock = mockPostTable();

      const res = await request(app)
        .post('/api/officers/session-interruptions')
        .set('Authorization', 'Bearer valid-token')
        .send(validPayload({ kind: 'app_closed', reason: null }));

      expect(res.status).toBe(201);
      expect(insertMock).toHaveBeenCalledWith([
        expect.objectContaining({ kind: 'app_closed', reason: null }),
      ]);
    });

    it('rejects invalid kind/step payloads', async () => {
      mockPostTable();

      const badKind = await request(app)
        .post('/api/officers/session-interruptions')
        .set('Authorization', 'Bearer valid-token')
        .send(validPayload({ kind: 'exploded' }));
      expect(badKind.status).toBe(400);

      const badStep = await request(app)
        .post('/api/officers/session-interruptions')
        .set('Authorization', 'Bearer valid-token')
        .send(validPayload({ step: 'saved' }));
      expect(badStep.status).toBe(400);
    });

    it('deduplicates re-posts by client-generated id (offline outbox retries)', async () => {
      const insertMock = mockPostTable({ id: 'int-123' });

      const res = await request(app)
        .post('/api/officers/session-interruptions')
        .set('Authorization', 'Bearer valid-token')
        .send(validPayload());

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, deduplicated: true });
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('returns 403 when a supervisor tries to submit (officers only)', async () => {
      mockPostTable();
      mockResolveProfileByEmail.mockResolvedValue(supervisorProfile);

      const res = await request(app)
        .post('/api/officers/session-interruptions')
        .set('Authorization', 'Bearer valid-token')
        .send(validPayload());

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Only officer accounts can report session interruptions');
    });
  });

  describe('GET /api/supervisor/session-interruptions', () => {
    const row = {
      id: 'int-123',
      officer_id: 23,
      officer_name: 'John Doe',
      badge_number: 'B123',
      draft_id: 'draft-abc',
      planned_test_id: null,
      step: 'reading',
      kind: 'app_closed',
      reason: null,
      occurred_at: '2026-10-10T10:15:00.000Z',
      created_at: '2026-10-10T10:16:00.000Z',
    };

    it('lists interruptions for supervisors with camelCase mapping', async () => {
      mockGetTable([row]);

      const res = await request(app)
        .get('/api/supervisor/session-interruptions')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: 'int-123',
        officerId: 23,
        officerName: 'John Doe',
        badgeNumber: 'B123',
        draftId: 'draft-abc',
        plannedTestId: null,
        step: 'reading',
        kind: 'app_closed',
        reason: null,
        occurredAt: '2026-10-10T10:15:00.000Z',
      });
    });

    it('applies the kind filter when given a valid kind', async () => {
      const { eqMock } = mockGetTable([]);

      const res = await request(app)
        .get('/api/supervisor/session-interruptions?kind=app_closed')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(eqMock).toHaveBeenCalledWith('kind', 'app_closed');
    });

    it('ignores an unknown kind filter instead of erroring', async () => {
      const { eqMock } = mockGetTable([]);

      const res = await request(app)
        .get('/api/supervisor/session-interruptions?kind=bogus')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(eqMock).not.toHaveBeenCalled();
    });

    it('returns 403 for officers on the supervisor list', async () => {
      mockResolveRoleByEmail.mockResolvedValue({ roleId: 1, dbId: 23 });

      const res = await request(app)
        .get('/api/supervisor/session-interruptions')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
    });
  });
});
