import request from 'supertest';
import express from 'express';

const mockFrom = jest.fn();
const mockGetUser = jest.fn();
const mockWriteAuditLog = jest.fn();

jest.mock('../../../src/supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args)
    }
  }
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args)
  }))
}));

jest.mock('../../../src/utilities/auditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args)
}));

import annotationsRouter from '../../../src/routes/supervisor/annotations';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/supervisor/tests/:testId/annotations', annotationsRouter);
  return app;
}

describe('supervisor annotations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'supervisor@integriscan.co.za' } },
      error: null
    });
    mockWriteAuditLog.mockResolvedValue(undefined);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'officer_users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [{ officer_id: 10, role_id: 2 }],
                error: null
              })
            })
          })
        };
      }
      if (table === 'tests') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [{ id: 'test-1' }],
                error: null
              })
            })
          })
        };
      }
      if (table === 'annotations') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: [], error: null })
            })
          }),
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [
                  {
                    id: 1,
                    test_id: 'test-1',
                    supervisor_email: 'supervisor@integriscan.co.za',
                    comment: 'Looks valid',
                    status: 'approved',
                    created_at: '2026-07-25T10:00:00.000Z',
                    updated_at: '2026-07-25T10:00:00.000Z'
                  }
                ],
                error: null
              })
            })
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({
                    data: [
                      {
                        id: 1,
                        test_id: 'test-1',
                        supervisor_email: 'supervisor@integriscan.co.za',
                        comment: 'Updated note',
                        status: 'referred',
                        created_at: '2026-07-25T10:00:00.000Z',
                        updated_at: '2026-07-25T11:00:00.000Z'
                      }
                    ],
                    error: null
                  })
                })
              })
            })
          })
        };
      }
      return {
        select: jest.fn().mockResolvedValue({ data: [], error: null })
      };
    });
  });

  it('creates an approved annotation', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/supervisor/tests/test-1/annotations')
      .set('Authorization', 'Bearer token')
      .send({ status: 'approved', comment: 'Looks valid' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('approved');
    expect(mockWriteAuditLog).toHaveBeenCalled();
  });

  it('rejects referred without comment', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/supervisor/tests/test-1/annotations')
      .set('Authorization', 'Bearer token')
      .send({ status: 'referred' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/comment/i);
  });

  it('updates an annotation (PATCH)', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch('/api/supervisor/tests/test-1/annotations/1')
      .set('Authorization', 'Bearer token')
      .send({ status: 'referred', comment: 'Updated note' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('referred');
  });
});
