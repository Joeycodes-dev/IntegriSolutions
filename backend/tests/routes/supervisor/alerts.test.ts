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
  const methods = ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'upsert', 'delete', 'neq', 'gt', 'gte', 'lte', 'not'];
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
    location_lat: null,
    location_lng: null,
    location_label: null,
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

    it('accepts a critical priority — the emergency/officer-safety/life-safety tier', async () => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({ priority: 'critical' }));

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 'alert-1' });
    });

    it.each(['urgent', 'emergency', 'HIGH', ''])('rejects an invalid priority value (%j)', async (priority) => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({ priority }));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/priority must be one of/i);
    });

    it('omitting priority still defaults to medium (backwards compatible)', async () => {
      const payload = validAlertPayload();
      delete (payload as Record<string, unknown>).priority;

      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(payload);

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

    it('creates an alert with no location at all — optional fields preserve existing (non-location) alerts', async () => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload());

      expect(res.status).toBe(201);
      expect(res.body.locationLat).toBeNull();
      expect(res.body.locationRadiusMeters).toBeNull();
    });

    it('accepts a valid location with lat, lng, and radiusMeters', async () => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({ location: { lat: -26.2041, lng: 28.0473, label: 'N1 Midrand', radiusMeters: 500 } }));

      expect(res.status).toBe(201);
    });

    it.each([
      [{ lat: -91, lng: 28 }, /lat/i],
      [{ lat: 91, lng: 28 }, /lat/i],
      [{ lat: -26, lng: -181 }, /lng/i],
      [{ lat: -26, lng: 181 }, /lng/i],
    ])('rejects an out-of-range coordinate %j', async (location, expectedMessage) => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({ location }));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(expectedMessage);
    });

    it.each([0, -100, 50001])('rejects an invalid trigger radius (%d)', async (radiusMeters) => {
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({ location: { lat: -26.2, lng: 28.0, radiusMeters } }));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/radiusMeters/i);
    });
  });

  describe('PATCH /api/supervisor/alerts/:id — location updates', () => {
    it('updates location fields including radiusMeters', async () => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') {
          return chainable({ data: alertRow({ location_lat: -26.2, location_lng: 28.0, location_radius_meters: 750 }), error: null });
        }
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ location: { lat: -26.2, lng: 28.0, radiusMeters: 750 } });

      expect(res.status).toBe(200);
      expect(res.body.locationRadiusMeters).toBe(750);
    });

    it('rejects an out-of-range coordinate on update', async () => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, () => null);

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ location: { lat: 200, lng: 28.0 } });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/lat/i);
    });
  });

  describe('PATCH /api/supervisor/alerts/:id — material-change versioning (Phase A1)', () => {
    it('increments version and requires re-acknowledgement on a priority increase', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({ data: alertRow({ priority: 'medium', version: 1 }), error: null });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ priority: 'critical' });

      expect(res.status).toBe(200);
      expect(res.body.materialChange).toBe(true);
      expect(alertsHandler.update.mock.calls[0][0]).toMatchObject({ priority: 'critical', version: 2 });
    });

    it('does not increment version on a priority decrease', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({ data: alertRow({ priority: 'high', version: 1 }), error: null });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ priority: 'low' });

      expect(res.status).toBe(200);
      expect(res.body.materialChange).toBe(false);
      expect(alertsHandler.update.mock.calls[0][0]).not.toHaveProperty('version');
    });

    it('increments version on a target scope / assignment change', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({ data: alertRow({ target_scope: 'all_officers', version: 1 }), error: null });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'operational_alert_officers') return chainable({ data: [], error: null });
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ targetScope: 'officers', officerIds: [23, 24] });

      expect(res.status).toBe(200);
      expect(res.body.materialChange).toBe(true);
      expect(alertsHandler.update.mock.calls[0][0]).toMatchObject({ target_scope: 'officers', version: 2 });
    });

    it('increments version on a location / trigger-radius change', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({
        data: alertRow({ location_lat: null, location_lng: null, location_radius_meters: null, version: 1 }),
        error: null,
      });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ location: { lat: -26.2, lng: 28.0, radiusMeters: 500 } });

      expect(res.status).toBe(200);
      expect(res.body.materialChange).toBe(true);
      expect(alertsHandler.update.mock.calls[0][0]).toMatchObject({ version: 2 });
    });

    it('increments version on a source authority/reference change', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({
        data: alertRow({
          alert_type: 'bolo_vehicle',
          source_type: 'external',
          source_authority: 'SAPS Klerksdorp',
          source_reference: 'CAS 100/01/2026',
          version: 1,
        }),
        error: null,
      });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ sourceType: 'external', sourceAuthority: 'SAPS Klerksdorp', sourceReference: 'CAS 999/09/2026' });

      expect(res.status).toBe(200);
      expect(res.body.materialChange).toBe(true);
      expect(alertsHandler.update.mock.calls[0][0]).toMatchObject({ version: 2 });
    });

    it('does not increment version for a description-only edit without the material-change override (typo/formatting)', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({ data: alertRow({ description: 'Be advised: flooding on N1', version: 1 }), error: null });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ description: 'Be advised: flooding on the N1 (typo fix)' });

      expect(res.status).toBe(200);
      expect(res.body.materialChange).toBe(false);
      expect(alertsHandler.update.mock.calls[0][0]).not.toHaveProperty('version');
    });

    it('increments version for a description edit when the Supervisor sets the material-change override', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({ data: alertRow({ description: 'Be advised: flooding on N1', version: 1 }), error: null });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ description: 'Road now fully closed — detour via R21', materialChangeOverride: true });

      expect(res.status).toBe(200);
      expect(res.body.materialChange).toBe(true);
      expect(alertsHandler.update.mock.calls[0][0]).toMatchObject({ version: 2 });
    });

    it('does not increment version for a minor expiry correction', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({ data: alertRow({ expires_at: '2026-09-09T12:00:00Z', version: 1 }), error: null });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ expiresAt: '2026-09-09T12:10:00Z' });

      expect(res.status).toBe(200);
      expect(res.body.materialChange).toBe(false);
      expect(alertsHandler.update.mock.calls[0][0]).not.toHaveProperty('version');
    });

    it('increments version when the expiry is meaningfully extended', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({ data: alertRow({ expires_at: '2026-09-09T12:00:00Z', version: 1 }), error: null });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ expiresAt: '2026-09-09T20:00:00Z' });

      expect(res.status).toBe(200);
      expect(res.body.materialChange).toBe(true);
      expect(alertsHandler.update.mock.calls[0][0]).toMatchObject({ version: 2 });
    });
  });

  describe('GET /api/supervisor/alerts/:id/acknowledgements — version-scoped coverage (Phase A1)', () => {
    it('excludes acknowledgements recorded against an earlier version of the alert', async () => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return chainable({ data: alertRow({ version: 2 }), error: null });
        if (table === 'operational_alert_acknowledgements') {
          return chainable({
            data: [
              { officer_id: 23, officer_name: 'John Doe', badge_number: 'B123', acknowledged_at: '2026-09-09T09:00:00Z', alert_version: 1 },
              { officer_id: 24, officer_name: 'Jane Smith', badge_number: 'B124', acknowledged_at: '2026-09-09T10:05:00Z', alert_version: 2 },
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
        { officerId: 24, officerName: 'Jane Smith', badgeNumber: 'B124', acknowledgedAt: '2026-09-09T10:05:00Z' },
      ]);
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

  describe('GET /api/supervisor/alerts/sightings', () => {
    function sightingRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 1,
        alert_id: 'alert-1',
        officer_id: 23,
        officer_name: 'John Doe',
        badge_number: 'B123',
        notes: 'Vehicle matching description seen',
        location_lat: -26.2041,
        location_lng: 28.0473,
        created_at: '2026-09-11T10:00:00Z',
        ...overrides,
      };
    }

    it('returns sightings joined with their parent alert context (type/priority/description)', async () => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alert_matches') return chainable({ data: [sightingRow()], error: null });
        if (table === 'operational_alerts') {
          return chainable({
            data: [{ id: 'alert-1', alert_type: 'bolo_vehicle', priority: 'high', description: 'Vehicle linked to robbery', source_type: 'external', source_authority: 'SAPS Klerksdorp', status: 'active' }],
            error: null,
          });
        }
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/sightings')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        expect.objectContaining({
          id: 1,
          alertId: 'alert-1',
          locationLat: -26.2041,
          locationLng: 28.0473,
          officerName: 'John Doe',
          alertType: 'bolo_vehicle',
          priority: 'high',
          alertDescription: 'Vehicle linked to robbery',
          sourceType: 'external',
          sourceAuthority: 'SAPS Klerksdorp',
        }),
      ]);
    });

    it('excludes sightings whose alert type does not match the alertType filter', async () => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alert_matches') return chainable({ data: [sightingRow()], error: null });
        if (table === 'operational_alerts') {
          return chainable({
            data: [{ id: 'alert-1', alert_type: 'general', priority: 'high', description: 'd', source_type: 'internal', source_authority: null, status: 'active' }],
            error: null,
          });
        }
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/sightings?alertType=bolo_vehicle')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('excludes sightings whose alert priority does not match the priority filter', async () => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alert_matches') return chainable({ data: [sightingRow()], error: null });
        if (table === 'operational_alerts') {
          return chainable({
            data: [{ id: 'alert-1', alert_type: 'general', priority: 'low', description: 'd', source_type: 'internal', source_authority: null, status: 'active' }],
            error: null,
          });
        }
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/sightings?priority=high')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('filters sightings by the critical priority', async () => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alert_matches') return chainable({ data: [sightingRow()], error: null });
        if (table === 'operational_alerts') {
          return chainable({
            data: [{ id: 'alert-1', alert_type: 'general', priority: 'critical', description: 'd', source_type: 'internal', source_authority: null, status: 'active' }],
            error: null,
          });
        }
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/sightings?priority=critical')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ priority: 'critical' });
    });

    it('lets an Admin read sightings too (read-only oversight)', async () => {
      const roleHandler = mockAsAdmin();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alert_matches') return chainable({ data: [], error: null });
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/sightings')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('does not let an Officer read the sightings endpoint (Officer has no web-portal access at all)', async () => {
      const roleHandler = mockAsOfficer();
      withTableHandlers(roleHandler, () => null);

      const res = await request(app)
        .get('/api/supervisor/alerts/sightings')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(403);
    });
  });
});
