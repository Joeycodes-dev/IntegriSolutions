import { Hono } from 'hono';
import request from '../../helpers/request';

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
import type { AppEnv } from '../../../src/env';

const app = new Hono<AppEnv>();
app.route('/api/supervisor/alerts', alertsRoutes);

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

/**
 * Coverage tests need `officer_users` to return real roster rows — but that
 * table is also queried once per request during role resolution
 * (resolveRoleByEmail checks admin_users, then officer_users, then
 * supervisor_users, using the first non-empty match), and a non-empty
 * officer_users match there would misidentify the Supervisor actor as an
 * Officer. This mock keeps the *first* officer_users call empty (so role
 * resolution correctly falls through to supervisor_users) and returns
 * `officerRows` from the second call onward (the route's own roster/profile
 * lookups).
 */
function withSupervisorAndOfficerRows(officerRows: Array<Record<string, unknown>>, extra: (table: string) => any) {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: 'sup-123', email: 'supervisor@example.com' } },
    error: null,
  });
  let officerCallCount = 0;
  mockServiceSupabase.from.mockImplementation((table: string) => {
    if (table === 'admin_users') return chainable({ data: [], error: null });
    if (table === 'officer_users') {
      officerCallCount += 1;
      return chainable({ data: officerCallCount === 1 ? [] : officerRows, error: null });
    }
    if (table === 'supervisor_users') return chainable({ data: [{ supervisor_id: 7, role_id: 2 }], error: null });
    const extraResult = extra(table);
    if (extraResult) return extraResult;
    return chainable({ data: [], error: null });
  });
}

function officerProfileRow(officerId: number, name: string, surname: string, badgeNumber: string) {
  return { officer_id: officerId, officer_name: name, officer_surname: surname, badge_number: badgeNumber };
}

function ackRow(officerId: number, officerName: string, badgeNumber: string, acknowledgedAt: string, alertVersion = 1) {
  return { officer_id: officerId, officer_name: officerName, badge_number: badgeNumber, acknowledged_at: acknowledgedAt, alert_version: alertVersion };
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

  describe('POST /api/supervisor/alerts — expiry defaults (Phase A2)', () => {
    it('applies a default expiry to a BOLO alert when none is provided', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({ data: [alertRow()], error: null });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const before = Date.now();
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
      const insertedExpiresAt = alertsHandler.insert.mock.calls[0][0][0].expires_at;
      expect(insertedExpiresAt).not.toBeNull();
      const deltaHours = (new Date(insertedExpiresAt).getTime() - before) / (60 * 60 * 1000);
      expect(deltaHours).toBeGreaterThan(70);
      expect(deltaHours).toBeLessThan(74);
    });

    it('applies a default expiry to a hazard alert when none is provided', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({ data: [alertRow()], error: null });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const before = Date.now();
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({ alertType: 'hazard' }));

      expect(res.status).toBe(201);
      const insertedExpiresAt = alertsHandler.insert.mock.calls[0][0][0].expires_at;
      expect(insertedExpiresAt).not.toBeNull();
      const deltaHours = (new Date(insertedExpiresAt).getTime() - before) / (60 * 60 * 1000);
      expect(deltaHours).toBeGreaterThan(22);
      expect(deltaHours).toBeLessThan(26);
    });

    it('leaves a general alert open-ended (no default expiry applied) when none is provided', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({ data: [alertRow()], error: null });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({ alertType: 'general' }));

      expect(res.status).toBe(201);
      expect(alertsHandler.insert.mock.calls[0][0][0].expires_at).toBeNull();
    });

    it('respects an explicit expiresAt on a BOLO alert instead of applying the default', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({ data: [alertRow()], error: null });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const explicitExpiresAt = '2026-12-01T00:00:00.000Z';
      const res = await request(app)
        .post('/api/supervisor/alerts')
        .set('Authorization', 'Bearer t')
        .send(validAlertPayload({
          alertType: 'bolo_vehicle',
          sourceType: 'external',
          sourceAuthority: 'SAPS Klerksdorp',
          sourceReference: 'CAS 123/09/2026',
          expiresAt: explicitExpiresAt,
        }));

      expect(res.status).toBe(201);
      expect(alertsHandler.insert.mock.calls[0][0][0].expires_at).toBe(explicitExpiresAt);
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

  describe('PATCH /api/supervisor/alerts/:id — resolution/cancellation reasons (Phase A2)', () => {
    it('requires a reason to resolve an alert', async () => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return chainable({ data: alertRow(), error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ status: 'resolved' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/reason is required/i);
    });

    it('requires a reason to cancel an alert', async () => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return chainable({ data: alertRow(), error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ status: 'cancelled' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/reason is required/i);
    });

    it('rejects a whitespace-only reason', async () => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return chainable({ data: alertRow(), error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ status: 'resolved', reason: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/reason is required/i);
    });

    it('persists the reason, acting supervisor, and timestamp when resolving', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({ data: alertRow({ status: 'resolved' }), error: null });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const before = Date.now();
      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ status: 'resolved', reason: 'Flooding has subsided, road reopened' });

      expect(res.status).toBe(200);
      const updateCall = alertsHandler.update.mock.calls[0][0];
      expect(updateCall.status_reason).toBe('Flooding has subsided, road reopened');
      expect(updateCall.status_reason_by).toBe('supervisor@example.com');
      expect(new Date(updateCall.status_reason_at).getTime()).toBeGreaterThanOrEqual(before);
    });

    it('persists the reason, acting supervisor, and timestamp when cancelling', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({ data: alertRow({ status: 'cancelled' }), error: null });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ status: 'cancelled', reason: 'Issued in error — wrong vehicle registration' });

      expect(res.status).toBe(200);
      const updateCall = alertsHandler.update.mock.calls[0][0];
      expect(updateCall.status_reason).toBe('Issued in error — wrong vehicle registration');
      expect(updateCall.status_reason_by).toBe('supervisor@example.com');
      expect(updateCall.status_reason_at).toBeTruthy();
    });

    it('does not require a reason for a non-closing status change', async () => {
      const roleHandler = mockAsSupervisor();
      const alertsHandler = chainable({ data: alertRow({ location_lat: -26.2, location_lng: 28.0 }), error: null });
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return alertsHandler;
        if (table === 'audit_logs') return chainable({ error: null });
        return null;
      });

      const res = await request(app)
        .patch('/api/supervisor/alerts/alert-1')
        .set('Authorization', 'Bearer t')
        .send({ location: { lat: -26.2, lng: 28.0 } });

      expect(res.status).toBe(200);
      expect(alertsHandler.update.mock.calls[0][0]).not.toHaveProperty('status_reason');
    });
  });

  describe('GET /api/supervisor/alerts/:id/coverage (Phase A2)', () => {
    it('computes coverage for an all_officers alert against the eligible roster', async () => {
      const officerRows = [
        officerProfileRow(21, 'Alice', 'A', 'B21'),
        officerProfileRow(22, 'Bob', 'B', 'B22'),
        officerProfileRow(23, 'Carol', 'C', 'B23'),
      ];
      withSupervisorAndOfficerRows(officerRows, (table) => {
        if (table === 'operational_alerts') return chainable({ data: alertRow({ target_scope: 'all_officers', version: 1 }), error: null });
        if (table === 'operational_alert_acknowledgements') {
          return chainable({
            data: [
              ackRow(21, 'Alice A', 'B21', '2026-09-10T10:00:00Z', 1),
              ackRow(22, 'Bob B', 'B22', '2026-09-10T10:01:00Z', 1),
            ],
            error: null,
          });
        }
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/alert-1/coverage')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        totalTargeted: 3,
        acknowledgedCount: 2,
        outstandingCount: 1,
        percentage: 67,
      });
      expect(res.body.outstandingOfficers).toEqual([{ officerId: 23, officerName: 'Carol C', badgeNumber: 'B23' }]);
      expect(res.body.acknowledgedOfficers.map((o: { officerId: number }) => o.officerId).sort()).toEqual([21, 22]);
    });

    it('computes coverage for a shift-targeted alert from assigned/accepted officers only', async () => {
      const officerRows = [officerProfileRow(31, 'Dan', 'D', 'B31'), officerProfileRow(32, 'Eve', 'E', 'B32')];
      withSupervisorAndOfficerRows(officerRows, (table) => {
        if (table === 'operational_alerts') {
          return chainable({ data: alertRow({ target_scope: 'shift', target_shift_id: 'shift-1', version: 1 }), error: null });
        }
        if (table === 'roadblock_shift_officers') {
          return chainable({ data: [{ officer_id: 31 }, { officer_id: 32 }], error: null });
        }
        if (table === 'operational_alert_acknowledgements') return chainable({ data: [], error: null });
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/alert-1/coverage')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ totalTargeted: 2, acknowledgedCount: 0, outstandingCount: 2, percentage: 0 });
      expect(res.body.outstandingOfficers.map((o: { officerId: number }) => o.officerId).sort()).toEqual([31, 32]);
    });

    it('computes coverage for an explicitly officer-targeted alert', async () => {
      const officerRows = [officerProfileRow(41, 'Fay', 'F', 'B41'), officerProfileRow(42, 'Gus', 'G', 'B42')];
      withSupervisorAndOfficerRows(officerRows, (table) => {
        if (table === 'operational_alerts') return chainable({ data: alertRow({ target_scope: 'officers', version: 1 }), error: null });
        if (table === 'operational_alert_officers') {
          return chainable({ data: [{ officer_id: 41 }, { officer_id: 42 }], error: null });
        }
        if (table === 'operational_alert_acknowledgements') {
          return chainable({ data: [ackRow(41, 'Fay F', 'B41', '2026-09-10T10:00:00Z', 1)], error: null });
        }
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/alert-1/coverage')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ totalTargeted: 2, acknowledgedCount: 1, outstandingCount: 1, percentage: 50 });
      expect(res.body.outstandingOfficers).toEqual([{ officerId: 42, officerName: 'Gus G', badgeNumber: 'B42' }]);
    });

    it('excludes an old-version acknowledgement from the current-version count', async () => {
      const officerRows = [officerProfileRow(41, 'Fay', 'F', 'B41'), officerProfileRow(42, 'Gus', 'G', 'B42')];
      withSupervisorAndOfficerRows(officerRows, (table) => {
        if (table === 'operational_alerts') return chainable({ data: alertRow({ target_scope: 'officers', version: 2 }), error: null });
        if (table === 'operational_alert_officers') {
          return chainable({ data: [{ officer_id: 41 }, { officer_id: 42 }], error: null });
        }
        if (table === 'operational_alert_acknowledgements') {
          return chainable({
            data: [
              ackRow(41, 'Fay F', 'B41', '2026-09-09T09:00:00Z', 1), // stale — acknowledged v1, alert is now v2
              ackRow(42, 'Gus G', 'B42', '2026-09-10T10:00:00Z', 2),
            ],
            error: null,
          });
        }
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/alert-1/coverage')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ totalTargeted: 2, acknowledgedCount: 1, outstandingCount: 1 });
      expect(res.body.acknowledgedOfficers).toEqual([{ officerId: 42, officerName: 'Gus G', badgeNumber: 'B42', acknowledgedAt: '2026-09-10T10:00:00Z' }]);
      expect(res.body.outstandingOfficers.map((o: { officerId: number }) => o.officerId)).toEqual([41]);
    });

    it('does not count an acknowledgement from an officer who is no longer eligible for the alert', async () => {
      const officerRows = [officerProfileRow(41, 'Fay', 'F', 'B41')];
      withSupervisorAndOfficerRows(officerRows, (table) => {
        if (table === 'operational_alerts') return chainable({ data: alertRow({ target_scope: 'officers', version: 1 }), error: null });
        if (table === 'operational_alert_officers') {
          // Only officer 41 is currently targeted.
          return chainable({ data: [{ officer_id: 41 }], error: null });
        }
        if (table === 'operational_alert_acknowledgements') {
          return chainable({
            data: [
              // Officer 99 acknowledged (e.g. before being removed from targeting) but is not eligible now.
              ackRow(99, 'Stray Officer', 'B99', '2026-09-09T09:00:00Z', 1),
            ],
            error: null,
          });
        }
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/alert-1/coverage')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body.totalTargeted).toBe(1);
      expect(res.body.acknowledgedCount).toBe(0);
      expect(res.body.outstandingCount).toBe(1);
      expect(res.body.outstandingOfficers).toEqual([{ officerId: 41, officerName: 'Fay F', badgeNumber: 'B41' }]);
    });

    it('returns 404 for an unknown alert', async () => {
      const roleHandler = mockAsSupervisor();
      withTableHandlers(roleHandler, (table) => {
        if (table === 'operational_alerts') return chainable({ data: null, error: null });
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/missing/coverage')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/supervisor/alerts/:id/coverage — Critical non-acknowledgement warning (Phase A2)', () => {
    it('warns when a Critical alert has outstanding officers past the threshold', async () => {
      const officerRows = [officerProfileRow(21, 'Alice', 'A', 'B21')];
      const overdueVersionUpdatedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      withSupervisorAndOfficerRows(officerRows, (table) => {
        if (table === 'operational_alerts') {
          return chainable({
            data: alertRow({ target_scope: 'all_officers', priority: 'critical', version: 1, version_updated_at: overdueVersionUpdatedAt }),
            error: null,
          });
        }
        if (table === 'operational_alert_acknowledgements') return chainable({ data: [], error: null });
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/alert-1/coverage')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body.criticalNonAckWarning).toBe(true);
      expect(res.body.criticalNonAckThresholdMinutes).toBe(15);
    });

    it('does not warn when a Critical alert is still within the threshold', async () => {
      const officerRows = [officerProfileRow(21, 'Alice', 'A', 'B21')];
      const recentVersionUpdatedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      withSupervisorAndOfficerRows(officerRows, (table) => {
        if (table === 'operational_alerts') {
          return chainable({
            data: alertRow({ target_scope: 'all_officers', priority: 'critical', version: 1, version_updated_at: recentVersionUpdatedAt }),
            error: null,
          });
        }
        if (table === 'operational_alert_acknowledgements') return chainable({ data: [], error: null });
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/alert-1/coverage')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body.criticalNonAckWarning).toBe(false);
    });

    it('never warns for a non-Critical alert, even past the threshold', async () => {
      const officerRows = [officerProfileRow(21, 'Alice', 'A', 'B21')];
      const overdueVersionUpdatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      withSupervisorAndOfficerRows(officerRows, (table) => {
        if (table === 'operational_alerts') {
          return chainable({
            data: alertRow({ target_scope: 'all_officers', priority: 'high', version: 1, version_updated_at: overdueVersionUpdatedAt }),
            error: null,
          });
        }
        if (table === 'operational_alert_acknowledgements') return chainable({ data: [], error: null });
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/alert-1/coverage')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body.criticalNonAckWarning).toBe(false);
    });

    it('does not warn once every targeted officer has acknowledged', async () => {
      const officerRows = [officerProfileRow(21, 'Alice', 'A', 'B21')];
      const overdueVersionUpdatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      withSupervisorAndOfficerRows(officerRows, (table) => {
        if (table === 'operational_alerts') {
          return chainable({
            data: alertRow({ target_scope: 'all_officers', priority: 'critical', version: 1, version_updated_at: overdueVersionUpdatedAt }),
            error: null,
          });
        }
        if (table === 'operational_alert_acknowledgements') {
          return chainable({ data: [ackRow(21, 'Alice A', 'B21', '2026-09-10T10:00:00Z', 1)], error: null });
        }
        return null;
      });

      const res = await request(app)
        .get('/api/supervisor/alerts/alert-1/coverage')
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(200);
      expect(res.body.criticalNonAckWarning).toBe(false);
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
        .send({ status: 'resolved', reason: 'Flooding has subsided, road reopened' });

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
