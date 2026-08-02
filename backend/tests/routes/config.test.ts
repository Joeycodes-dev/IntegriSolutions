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

import configRoutes from '../../src/routes/config';
import { supabase } from '../../src/supabase';

const app = express();
app.use('/api/config', configRoutes);

describe('Runtime Config Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'officer-1', email: 'officer@example.com' } },
      error: null,
    });

    mockServiceSupabase.from.mockImplementation((table: string) => {
      if (table === 'system_settings') {
        return {
          select: jest.fn().mockResolvedValue({
            data: [
              { key: 'auth.session_timeout_minutes', value: '45' },
              { key: 'export.pdf_access', value: 'admin_only' },
              { key: 'bac.professional.limit_g100ml', value: '0.03' }
            ],
            error: null,
          }),
        };
      }
      return {
        select: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
  });

  it('serves role-safe runtime settings to authenticated users', async () => {
    const response = await request(app)
      .get('/api/config/runtime')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.auth.sessionTimeoutMinutes).toBe(45);
    expect(response.body.export.pdfAccess).toBe('admin_only');
    expect(response.body.bacLimits[1].limitG100ml).toBe(0.03);
    expect(response.body.bacLimits[0].limitG100ml).toBe(0.05);
    expect(response.body.revision).toBeUndefined();
    expect(response.body.updatedBy).toBeUndefined();
  });

  it('returns 401 without authentication', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const response = await request(app).get('/api/config/runtime');
    expect(response.status).toBe(401);
  });
});
