import request from 'supertest';
import express from 'express';

const mockServiceSupabase: any = {
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
  resolveProfileByEmail: (...args: any[]) => mockResolveProfileByEmail(...args),
}));

import alertsRoutes, { MATCH_ESCALATION_DISCLAIMER } from '../../src/routes/alerts';
import { supabase } from '../../src/supabase';

const app = express();
app.use(express.json());
app.use('/api/alerts', alertsRoutes);

function chainable(result: { data?: unknown; error?: unknown }) {
  const handler: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'upsert', 'delete'];
  for (const method of methods) {
    handler[method] = jest.fn(() => handler);
  }
  handler.maybeSingle = jest.fn().mockResolvedValue(result);
  handler.single = jest.fn().mockResolvedValue(result);
  handler.then = (onResolve: any, onReject: any) => Promise.resolve(result).then(onResolve, onReject);
  return handler as any;
}

/** Returns a fresh chainable per call, in the fixed order the route issues them
 * (all_officers query, then shift query, then explicit-officer query). */
function sequentialChainable(results: Array<{ data?: unknown; error?: unknown }>) {
  let index = 0;
  return jest.fn(() => {
    const result = results[Math.min(index, results.length - 1)];
    index += 1;
    return chainable(result);
  });
}

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

function mockAuthAsOfficer() {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: 'user-123', email: 'officer@example.com' } },
    error: null,
  });
  mockResolveProfileByEmail.mockResolvedValue(officerProfile);
}

function baseAlertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-1',
    alert_type: 'general',
    priority: 'medium',
    description: 'Be advised',
    vehicle_registration: null,
    vehicle_description: null,
    person_name: null,
    person_description: null,
    person_reference: null,
    photo_url: null,
    issued_by_name: 'supervisor',
    target_scope: 'all_officers',
    source_type: 'internal',
    source_authority: null,
    source_reference: null,
    status: 'active',
    expires_at: null,
    created_at: '2026-09-09T10:00:00Z',
    ...overrides,
  };
}

describe('Officer Operational Alerts Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthAsOfficer();
  });

  describe('GET /api/alerts/active', () => {
    it('returns alerts targeted to all officers, the officer\'s shift, and the officer directly, deduplicated', async () => {
      const allOfficersAlert = baseAlertRow({ id: 'alert-all', target_scope: 'all_officers' });
      const shiftAlert = baseAlertRow({ id: 'alert-shift', target_scope: 'shift', priority: 'high' });
      const explicitAlert = baseAlertRow({ id: 'alert-explicit', target_scope: 'officers', priority: 'low' });

      const operationalAlertsSequence = sequentialChainable([
        { data: [allOfficersAlert], error: null },
        { data: [shiftAlert], error: null },
        { data: [explicitAlert], error: null },
      ]);

      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'roadblock_shift_officers') {
          return chainable({ data: [{ shift_id: 'shift-1', assignment_status: 'accepted' }], error: null });
        }
        if (table === 'operational_alert_officers') {
          return chainable({ data: [{ alert_id: 'alert-explicit' }], error: null });
        }
        if (table === 'operational_alerts') {
          return operationalAlertsSequence();
        }
        if (table === 'operational_alert_acknowledgements') {
          return chainable({ data: [], error: null });
        }
        return chainable({ data: [], error: null });
      });

      const res = await request(app).get('/api/alerts/active').set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      const ids = res.body.map((row: any) => row.id).sort();
      expect(ids).toEqual(['alert-all', 'alert-explicit', 'alert-shift']);
      // High priority first.
      expect(res.body[0].id).toBe('alert-shift');
    });

    it('excludes an alert once it has expired', async () => {
      const expiredAlert = baseAlertRow({
        id: 'alert-expired',
        target_scope: 'all_officers',
        expires_at: '2020-01-01T00:00:00Z',
      });

      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'roadblock_shift_officers') return chainable({ data: [], error: null });
        if (table === 'operational_alert_officers') return chainable({ data: [], error: null });
        if (table === 'operational_alerts') return chainable({ data: [expiredAlert], error: null });
        return chainable({ data: [], error: null });
      });

      const res = await request(app).get('/api/alerts/active').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

  });

  describe('POST /api/alerts/:id/acknowledge', () => {
    it('acknowledges an eligible alert', async () => {
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'operational_alerts') return chainable({ data: baseAlertRow(), error: null });
        if (table === 'operational_alert_acknowledgements') {
          return chainable({ data: { acknowledged_at: '2026-09-09T10:05:00Z' }, error: null });
        }
        return chainable({ data: [], error: null });
      });

      const res = await request(app)
        .post('/api/alerts/alert-1/acknowledge')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ alertId: 'alert-1', acknowledgedAt: '2026-09-09T10:05:00Z' });
    });

    it('is idempotent — acknowledging twice succeeds both times with the same upsert target', async () => {
      const ackHandler = chainable({ data: { acknowledged_at: '2026-09-09T10:05:00Z' }, error: null });
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'operational_alerts') return chainable({ data: baseAlertRow(), error: null });
        if (table === 'operational_alert_acknowledgements') return ackHandler;
        return chainable({ data: [], error: null });
      });

      const first = await request(app).post('/api/alerts/alert-1/acknowledge').set('Authorization', 'Bearer t');
      const second = await request(app).post('/api/alerts/alert-1/acknowledge').set('Authorization', 'Bearer t');

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(ackHandler.upsert).toHaveBeenCalledTimes(2);
      const [, upsertOptions] = ackHandler.upsert.mock.calls[0];
      expect(upsertOptions).toMatchObject({ onConflict: 'alert_id,officer_id' });
    });

    it('returns 404 for an unknown alert', async () => {
      mockServiceSupabase.from.mockImplementation(() => chainable({ data: null, error: null }));

      const res = await request(app).post('/api/alerts/missing/acknowledge').set('Authorization', 'Bearer t');
      expect(res.status).toBe(404);
    });

    it('returns 403 when the alert is shift-targeted and the officer is not assigned to that shift', async () => {
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'operational_alerts') {
          return chainable({ data: baseAlertRow({ target_scope: 'shift', target_shift_id: 'shift-1' }), error: null });
        }
        if (table === 'roadblock_shift_officers') return chainable({ data: null, error: null });
        return chainable({ data: [], error: null });
      });

      const res = await request(app).post('/api/alerts/alert-1/acknowledge').set('Authorization', 'Bearer t');
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/not targeted to you/i);
    });

    it('acknowledges a shift-targeted alert when the officer is assigned to that shift', async () => {
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'operational_alerts') {
          return chainable({ data: baseAlertRow({ target_scope: 'shift', target_shift_id: 'shift-1' }), error: null });
        }
        if (table === 'roadblock_shift_officers') return chainable({ data: { shift_id: 'shift-1' }, error: null });
        if (table === 'operational_alert_acknowledgements') {
          return chainable({ data: { acknowledged_at: '2026-09-09T10:05:00Z' }, error: null });
        }
        return chainable({ data: [], error: null });
      });

      const res = await request(app).post('/api/alerts/alert-1/acknowledge').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
    });

    it('returns 409 when the alert has been resolved', async () => {
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'operational_alerts') return chainable({ data: baseAlertRow({ status: 'resolved' }), error: null });
        return chainable({ data: [], error: null });
      });

      const res = await request(app).post('/api/alerts/alert-1/acknowledge').set('Authorization', 'Bearer t');
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/no longer active/i);
    });

    it('returns 409 when the alert has expired', async () => {
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'operational_alerts') {
          return chainable({ data: baseAlertRow({ expires_at: '2020-01-01T00:00:00Z' }), error: null });
        }
        return chainable({ data: [], error: null });
      });

      const res = await request(app).post('/api/alerts/alert-1/acknowledge').set('Authorization', 'Bearer t');
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/expired/i);
    });

    it('writes a neutral audit log entry on acknowledgement', async () => {
      const auditHandler = chainable({ error: null });
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'operational_alerts') return chainable({ data: baseAlertRow(), error: null });
        if (table === 'operational_alert_acknowledgements') {
          return chainable({ data: { acknowledged_at: '2026-09-09T10:05:00Z' }, error: null });
        }
        if (table === 'audit_logs') return auditHandler;
        return chainable({ data: [], error: null });
      });

      await request(app).post('/api/alerts/alert-1/acknowledge').set('Authorization', 'Bearer t');

      expect(auditHandler.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          actor_email: 'officer@example.com',
          action: 'Acknowledged operational alert alert-1',
        }),
      ]);
    });
  });

  describe('POST /api/alerts/:id/matches', () => {
    it('reports a possible match and never touches the alert status', async () => {
      const operationalAlertsHandler = chainable({ data: baseAlertRow(), error: null });
      const matchesHandler = chainable({
        data: { id: 1, notes: 'Vehicle matching description seen at N1 offramp', created_at: '2026-09-09T10:10:00Z' },
        error: null,
      });
      const auditHandler = chainable({ error: null });

      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'operational_alerts') return operationalAlertsHandler;
        if (table === 'operational_alert_matches') return matchesHandler;
        if (table === 'audit_logs') return auditHandler;
        return chainable({ data: [], error: null });
      });

      const res = await request(app)
        .post('/api/alerts/alert-1/matches')
        .set('Authorization', 'Bearer t')
        .send({ notes: 'Vehicle matching description seen at N1 offramp' });

      expect(res.status).toBe(201);
      expect(res.body.disclaimer).toBe(MATCH_ESCALATION_DISCLAIMER);
      expect(res.body).not.toHaveProperty('status');
      // Possible-match reporting must never mutate the parent alert row.
      expect(operationalAlertsHandler.update).not.toHaveBeenCalled();
    });

    it('requires notes', async () => {
      mockServiceSupabase.from.mockImplementation(() => chainable({ data: { id: 'alert-1' }, error: null }));

      const res = await request(app)
        .post('/api/alerts/alert-1/matches')
        .set('Authorization', 'Bearer t')
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 403 when the alert is targeted to other officers only', async () => {
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'operational_alerts') return chainable({ data: baseAlertRow({ target_scope: 'officers' }), error: null });
        if (table === 'operational_alert_officers') return chainable({ data: null, error: null });
        return chainable({ data: [], error: null });
      });

      const res = await request(app)
        .post('/api/alerts/alert-1/matches')
        .set('Authorization', 'Bearer t')
        .send({ notes: 'Seen near offramp' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/not targeted to you/i);
    });

    it('returns 409 when the alert has been cancelled', async () => {
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'operational_alerts') return chainable({ data: baseAlertRow({ status: 'cancelled' }), error: null });
        return chainable({ data: [], error: null });
      });

      const res = await request(app)
        .post('/api/alerts/alert-1/matches')
        .set('Authorization', 'Bearer t')
        .send({ notes: 'Seen near offramp' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/no longer active/i);
    });

  });
});
