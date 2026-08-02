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

import casesRoutes from '../../../src/routes/supervisor/cases';
import { supabase } from '../../../src/supabase';

const app = express();
app.use(express.json());
app.use('/api/supervisor/cases', casesRoutes);

describe('Cases Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'supervisor-123', email: 'supervisor@example.com' } },
      error: null,
    });

    const roleLookup = (table: string) => {
      if (table === 'admin_users' || table === 'officer_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
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
      return null;
    };

    mockServiceSupabase.from.mockImplementation((table: string) => {
      const roleMock = roleLookup(table);
      if (roleMock) return roleMock;

      if (table === 'tests') {
        return {
          select: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [
                  {
                    id: 'test-1',
                    officer_id: 1,
                    officer_name: 'Officer One',
                    badge_number: 'B001',
                    driver_name: 'Driver A',
                    driver_id: 'DL001',
                    driver_dob: '1990-01-01',
                    bac_reading: 0.08,
                    result: 'fail',
                    location: '{}',
                    created_at: '2026-05-30T10:00:00Z',
                  },
                  {
                    id: 'test-2',
                    officer_id: 2,
                    officer_name: 'Officer Two',
                    badge_number: 'B002',
                    driver_name: 'Driver B',
                    driver_id: 'DL002',
                    driver_dob: '1985-02-02',
                    bac_reading: 0.0,
                    result: 'pass',
                    location: '{}',
                    created_at: '2026-05-29T14:00:00Z',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'case_records') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [
                {
                  test_id: 'test-1',
                  case_status: 'verified',
                  supervisor_email: 'supervisor@example.com',
                  comment: 'All good',
                  updated_at: '2026-05-30T12:00:00Z',
                },
              ],
              error: null,
            }),
          }),
        };
      }
      return {
        select: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
  });

  describe('GET /api/supervisor/cases', () => {
    it('should return cases with current status and test metadata', async () => {
      const response = await request(app)
        .get('/api/supervisor/cases')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({
        id: 'test-1',
        officerName: 'Officer One',
        driverName: 'Driver A',
        caseStatus: 'verified',
        supervisorEmail: 'supervisor@example.com',
        lastComment: 'All good',
      });
      expect(response.body[1]).toMatchObject({
        id: 'test-2',
        caseStatus: 'new',
      });
    });

    it('should filter cases by status', async () => {
      const response = await request(app)
        .get('/api/supervisor/cases?status=verified')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe('test-1');
    });

    it('should return 503 when case_records table is missing', async () => {
      mockServiceSupabase.from.mockImplementation((table: string) => {
        if (table === 'admin_users' || table === 'officer_users') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
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
        if (table === 'tests') {
          return {
            select: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [{ id: 'test-1', officer_name: 'O', badge_number: 'B', driver_name: 'D', driver_id: 'DL', bac_reading: 0, result: 'pass', location: '{}', created_at: '2026-05-30T10:00:00Z' }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'case_records') {
          return {
            select: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({
                data: null,
                error: { code: '42P01', message: 'relation "case_records" does not exist' },
              }),
            }),
          };
        }
        return {
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const response = await request(app)
        .get('/api/supervisor/cases')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(503);
      expect(response.body.error).toContain('Case records table');
    });

    it('should return 401 without authentication', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const response = await request(app)
        .get('/api/supervisor/cases');

      expect(response.status).toBe(401);
    });
  });
});
