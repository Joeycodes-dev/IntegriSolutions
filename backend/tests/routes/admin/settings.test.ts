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

import settingsRoutes from '../../../src/routes/admin/settings';
import { supabase } from '../../../src/supabase';

const app = express();
app.use(express.json());
app.use('/api/admin/settings', settingsRoutes);

const STORED_SETTINGS: Array<Record<string, unknown>> = [
  { key: 'auth.session_timeout_minutes', value: '30', updated_at: '2026-08-02T08:00:00Z', updated_by: null },
  { key: 'export.pdf_watermark_enabled', value: 'true', updated_at: '2026-08-02T08:00:00Z', updated_by: null },
  { key: 'export.pdf_watermark_text', value: 'IntegriScan Court Evidence', updated_at: '2026-08-02T08:00:00Z', updated_by: null },
  { key: 'export.pdf_access', value: 'admin_supervisor', updated_at: '2026-08-02T08:00:00Z', updated_by: null },
  { key: 'alerts.integrity_flag_count', value: '1', updated_at: '2026-08-02T08:00:00Z', updated_by: null },
  { key: 'alerts.failure_rate_change_points', value: '1', updated_at: '2026-08-02T08:00:00Z', updated_by: null },
  { key: 'alerts.roadblock_minimum_tests', value: '3', updated_at: '2026-08-02T08:00:00Z', updated_by: null },
  { key: 'alerts.avg_failing_bac_multiple', value: '2', updated_at: '2026-08-02T08:00:00Z', updated_by: null },
  { key: 'bac.general.limit_g100ml', value: '0.05', updated_at: '2026-08-02T08:00:00Z', updated_by: null },
  { key: 'bac.general.limit_mg1000ml', value: '0.24', updated_at: '2026-08-02T08:00:00Z', updated_by: null },
  { key: 'bac.professional.limit_g100ml', value: '0.02', updated_at: '2026-08-02T08:00:00Z', updated_by: null },
  { key: 'bac.professional.limit_mg1000ml', value: '0.10', updated_at: '2026-08-02T08:00:00Z', updated_by: null },
  { key: 'system.config_revision', value: '1', updated_at: '2026-08-02T08:00:00Z', updated_by: null }
];

describe('Admin Settings Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@example.com' } },
      error: null,
    });

    const roleLookup = (table: string) => {
      if (table === 'admin_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [{ admin_id: 1, role_id: 3 }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'officer_users' || table === 'supervisor_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      return null;
    };

    mockServiceSupabase.from.mockImplementation((table: string) => {
      const roleMock = roleLookup(table);
      if (roleMock) return roleMock;

      if (table === 'system_settings') {
        return {
          select: jest.fn().mockResolvedValue({ data: STORED_SETTINGS, error: null }),
          upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === 'audit_logs') {
        return {
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {
        select: jest.fn().mockResolvedValue({ data: [], error: null }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  });

  it('returns the typed configuration for admins', async () => {
    const response = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      revision: 1,
      auth: { sessionTimeoutMinutes: 30 },
      export: {
        pdfWatermarkEnabled: true,
        pdfWatermarkText: 'IntegriScan Court Evidence',
        pdfAccess: 'admin_supervisor'
      },
      alerts: {
        integrityFlagCount: 1,
        failureRateChangePoints: 1,
        roadblockMinimumTests: 3,
        avgFailingBacMultiple: 2
      },
      bacLimits: [
        { key: 'general', limitG100ml: 0.05, limitMg1000ml: 0.24 },
        { key: 'professional', limitG100ml: 0.02, limitMg1000ml: 0.1 }
      ]
    });
  });

  it('persists valid updates and returns the new revision', async () => {
    const response = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', 'Bearer valid-token')
      .send({
        expectedRevision: 1,
        values: {
          'auth.session_timeout_minutes': 60,
          'export.pdf_access': 'admin_only',
          'bac.professional.limit_g100ml': 0.03
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.revision).toBe(2);
    expect(response.body.auth.sessionTimeoutMinutes).toBe(60);
    expect(response.body.export.pdfAccess).toBe('admin_only');
    expect(response.body.bacLimits[1].limitG100ml).toBe(0.03);
    expect(response.body.updatedBy).toBe('admin@example.com');

    const upsertCall = mockServiceSupabase.from.mock.calls.find(
      ([table]) => table === 'system_settings'
    )?.[0];
    void upsertCall;
    const upsertResult = mockServiceSupabase.from.mock.results
      .filter((_result, index) => mockServiceSupabase.from.mock.calls[index][0] === 'system_settings')
      .pop();
    const rows = upsertResult?.value.upsert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(4);
    expect(rows.some((row) => row.key === 'auth.session_timeout_minutes' && row.value === '60')).toBe(true);
    expect(rows.some((row) => row.key === 'system.config_revision' && row.value === '2')).toBe(true);

    const auditCall = mockServiceSupabase.from.mock.calls.find(
      ([table]) => table === 'audit_logs'
    );
    expect(auditCall).toBeTruthy();
  });

  it('rejects unknown settings keys', async () => {
    const response = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', 'Bearer valid-token')
      .send({ expectedRevision: 1, values: { 'retention.evidence_days': 90 } });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Unknown setting key');
  });

  it('rejects invalid values', async () => {
    const response = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', 'Bearer valid-token')
      .send({ expectedRevision: 1, values: { 'auth.session_timeout_minutes': 1 } });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('at least 5');
  });

  it('returns 409 when the revision is stale', async () => {
    const response = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', 'Bearer valid-token')
      .send({ expectedRevision: 9, values: { 'auth.session_timeout_minutes': 60 } });

    expect(response.status).toBe(409);
    expect(response.body.currentRevision).toBe(1);
  });

  it('rejects a missing expectedRevision', async () => {
    const response = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', 'Bearer valid-token')
      .send({ values: { 'auth.session_timeout_minutes': 60 } });

    expect(response.status).toBe(400);
  });

  it('denies non-admin roles', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'supervisor-1', email: 'supervisor@example.com' } },
      error: null,
    });
    mockServiceSupabase.from.mockImplementation((table: string) => {
      if (table === 'admin_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'officer_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'supervisor_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [{ supervisor_id: 1, role_id: 2 }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: jest.fn().mockResolvedValue({ data: [], error: null }),
        upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const response = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
  });

  it('returns 401 without authentication', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const response = await request(app).get('/api/admin/settings');
    expect(response.status).toBe(401);
  });
});
