import request from 'supertest';
import express from 'express';

const mockServiceSupabase = {
  from: jest.fn(),
  storage: {
    from: jest.fn(),
  },
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

import alertsRoutes from '../../../src/routes/supervisor/alerts';
import { supabase } from '../../../src/supabase';

const app = express();
app.use(express.json());
app.use('/api/supervisor/alerts', alertsRoutes);

/** Generic thenable query-builder mock: every filter/mutation method returns
 * itself, and awaiting the chain (or calling .single()/.maybeSingle()) resolves
 * to the configured result — mirrors the real supabase-js builder shape closely
 * enough for these routes without hand-writing one bespoke chain per call site. */
function chainable(result: { data?: unknown; error?: unknown }) {
  const handler: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'upsert', 'delete', 'neq', 'gt', 'gte', 'lte'];
  for (const method of methods) {
    handler[method] = jest.fn(() => handler);
  }
  handler.maybeSingle = jest.fn().mockResolvedValue(result);
  handler.single = jest.fn().mockResolvedValue(result);
  handler.then = (onResolve: any, onReject: any) => Promise.resolve(result).then(onResolve, onReject);
  return handler as any;
}

function roleTableHandler(source: 'admin_users' | 'officer_users' | 'supervisor_users', row: Record<string, unknown>) {
  return (table: string) => {
    if (table === source) return chainable({ data: [row], error: null });
    if (table === 'admin_users' || table === 'officer_users' || table === 'supervisor_users') {
      return chainable({ data: [], error: null });
    }
    return null;
  };
}

function mockAsSupervisor() {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: 'sup-123', email: 'supervisor@example.com' } },
    error: null,
  });
  return roleTableHandler('supervisor_users', { supervisor_id: 7, role_id: 2 });
}

function mockAsAdmin() {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: 'admin-123', email: 'admin@example.com' } },
    error: null,
  });
  return roleTableHandler('admin_users', { admin_id: 9, role_id: 3 });
}

function mockAsOfficer() {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: 'user-123', email: 'officer@example.com' } },
    error: null,
  });
  return roleTableHandler('officer_users', { officer_id: 23, role_id: 1 });
}

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-1',
    alert_type: 'general',
    priority: 'medium',
    description: 'Be advised: flooding on N1',
    vehicle_registration: null,
    vehicle_description: null,
    person_name: null,
    person_description: null,
    person_reference: null,
    photo_url: null,
    issued_by_source: 'supervisor_users',
    issued_by_id: 7,
    issued_by_name: 'supervisor',
    target_scope: 'all_officers',
    target_shift_id: null,
    source_type: 'internal',
    source_authority: null,
    source_reference: null,
    status: 'active',
    expires_at: null,
    created_at: '2026-09-09T10:00:00Z',
    updated_at: '2026-09-09T10:00:00Z',
    ...overrides,
  };
}

function withTableHandlers(roleHandler: (table: string) => any, extra: (table: string) => any) {
  mockServiceSupabase.from.mockImplementation((table: string) => {
    const roleResult = roleHandler(table);
    if (roleResult) return roleResult;
    const extraResult = extra(table);
    if (extraResult) return extraResult;
    return chainable({ data: [], error: null });
  });
}

function validAlertPayload(overrides: Record<string, unknown> = {}) {
  return {
    alertType: 'general',
    priority: 'medium',
    description: 'Be advised: flooding on N1',
    targetScope: 'all_officers',
    ...overrides,
  };
}

describe('Supervisor Operational Alerts Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/supervisor/alerts — business rule validation', () => {
    beforeEach(() => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return chainable({ data: [alertRow()], error: null });
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });
    });

    it('rejects an internally sourced bolo_person alert', async () => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({ alertType: 'bolo_person', sourceType: 'internal' }));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/external authority/i);
    });

    it('rejects an internally sourced bolo_vehicle alert', async () => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({ alertType: 'bolo_vehicle', sourceType: 'internal' }));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/external authority/i);
    });

    it('accepts an externally sourced BOLO with authority and reference', async () => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({
          alertType: 'bolo_vehicle',
          sourceType: 'external',
          sourceAuthority: 'SAPS Klerksdorp',
          sourceReference: 'CAS 123/09/2026',
        }));

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 'alert-1' });
    });

    it('rejects an external BOLO without a source authority', async () => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({
          alertType: 'bolo_person',
          sourceType: 'external',
          sourceReference: 'CAS 123/09/2026',
        }));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/source authority and a source reference/i);
    });

    it('rejects an external BOLO without a source reference', async () => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({
          alertType: 'bolo_person',
          sourceType: 'external',
          sourceAuthority: 'SAPS Klerksdorp',
        }));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/source authority and a source reference/i);
    });

    it('allows a hazard alert to be internal', async () => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({ alertType: 'hazard', sourceType: 'internal' }));

      expect(res.status).toBe(201);
    });

    it('allows a general alert to be internal', async () => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({ alertType: 'general', sourceType: 'internal' }));

      expect(res.status).toBe(201);
    });

    it('rejects a 13-digit numeric person_reference', async () => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({ personReference: '9001015009087' }));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/full ID number/i);
    });

    it('accepts a non-ID-shaped person_reference', async () => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({ alertType: 'general', personReference: 'partial plate ABC-1**' }));

      expect(res.status).toBe(201);
    });

  });

  describe('Authorization model', () => {
    it('lets a Supervisor create an alert', async () => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return chainable({ data: [alertRow()], error: null });
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload());

      expect(res.status).toBe(201);
    });

    it('lets a Supervisor update (manage) an alert', async () => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return chainable({ data: alertRow({ status: 'resolved' }), error: null });
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ status: 'resolved' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('resolved');
    });

    it('does not let an Admin create an alert', async () => {
      const roleHandler = mockAsAdmin();
      withTableHandlers(roleHandler, () => null);

      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload());

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/only supervisor accounts/i);
    });

    it('does not let an Admin update (mutate) an alert', async () => {
      const roleHandler = mockAsAdmin();
      withTableHandlers(roleHandler, () => null);

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ status: 'resolved' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/only supervisor accounts/i);
    });

    it('lets an Admin read alerts', async () => {
      const roleHandler = mockAsAdmin();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return chainable({ data: [], error: null });
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('does not let an Officer create or manage alerts', async () => {
      const roleHandler = mockAsOfficer();
      withTableHandlers(roleHandler, () => null);

      const createRes = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload());
      expect(createRes.status).toBe(403);

      const patchRes = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ status: 'resolved' });
      expect(patchRes.status).toBe(403);
    });
  });

  describe('GET /api/supervisor/alerts/:id/acknowledgements', () => {
    it('returns the expected acknowledgement rows for an alert', async () => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alert_acknowledgements') {
          return chainable({
            data: [
              { officer_id: 23, officer_name: 'John Doe', badge_number: 'B123', acknowledged_at: '2026-09-09T10:05:00Z' },
              { officer_id: 24, officer_name: 'Jane Smith', badge_number: 'B124', acknowledged_at: '2026-09-09T10:02:00Z' },
            ],
            error: null,
          });
        }
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/alert-1/acknowledgements')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { officerId: 23, officerName: 'John Doe', badgeNumber: 'B123', acknowledgedAt: '2026-09-09T10:05:00Z' },
        { officerId: 24, officerName: 'Jane Smith', badgeNumber: 'B124', acknowledgedAt: '2026-09-09T10:02:00Z' },
      ]);
    });

    it('lets an Admin read acknowledgements too', async () => {
      const roleHandler = mockAsAdmin();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alert_acknowledgements') return chainable({ data: [], error: null });
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/alert-1/acknowledgements')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

});
