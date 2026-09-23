import { Hono } from 'hono';
import request from '../helpers/request';

const mockServiceSupabase: any = {
  from: jest.fn(),
  storage: { from: jest.fn() },
};
const mockResolveProfileByEmail = jest.fn();

jest.mock('../../src/supabase', () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockServiceSupabase),
}));
jest.mock('../../src/utilities/resolveProfile', () => ({
  resolveProfileByEmail: (...args: any[]) => mockResolveProfileByEmail(...args),
}));

import chatRoutes from '../../src/routes/chat';
import { supabase } from '../../src/supabase';
import type { AppEnv } from '../../src/env';

const app = new Hono<AppEnv>();
app.route('/api/chat', chatRoutes);

function mockAuthAs(email = 'officer@example.com', id = 'user-123') {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id, email } },
    error: null,
  });
}

const officerActor = {
  source: 'officer_users' as const,
  dbId: 11,
  profile: {
    uid: 'user-123', officerId: 11, email: 'officer@example.com',
    name: 'John', surname: 'Doe', badgeNumber: 'B11', idNumber: '9001015009087',
    employmentStatus: 'Active', province: 'Gauteng', region: 'Tshwane',
    officerTypeId: 1, roleId: 1, createdAt: '2026-05-30T09:00:00Z',
  },
};

const supervisorActor = {
  source: 'supervisor_users' as const,
  dbId: 7,
  profile: {
    uid: 'sup-123', officerId: 7, email: 'supervisor@example.com',
    name: 'Sara', surname: 'Super', badgeNumber: 'S1', idNumber: '8001015009087',
    employmentStatus: 'Active', province: 'Gauteng', region: 'Joburg',
    officerTypeId: 1, roleId: 2, createdAt: '2026-05-30T09:00:00Z',
  },
};

/**
 * Tolerant Supabase query-builder mock.
 * Every chain method (eq/in/order/...) returns the same thenable,
 * so tests don't break when the route adds another .eq() in the chain.
 * `await builder` resolves to `result`.
 */
function chain(result: any) {
  const c: any = {};
  c.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  for (const m of ['eq', 'neq', 'or', 'gt', 'lt', 'gte', 'lte', 'in', 'order', 'limit', 'maybeSingle', 'single', 'select', 'insert', 'update', 'delete', 'upsert']) {
    c[m] = jest.fn().mockReturnValue(c);
  }
  return c;
}

/** One from() call. Only the used operation needs a result; others default safely. */
function fromMock(opts: { select?: any; insert?: any; update?: any; upsert?: any; del?: any } = {}) {
  return {
    select: jest.fn().mockReturnValue(chain(opts.select ?? { data: null, error: null })),
    insert: jest.fn().mockReturnValue(chain(opts.insert ?? { error: null })),
    update: jest.fn().mockReturnValue(chain(opts.update ?? { error: null })),
    upsert: jest.fn().mockResolvedValue(opts.upsert ?? { error: null }),
    delete: jest.fn().mockReturnValue(chain(opts.del ?? { error: null })),
  };
}

function ensureOk(threadId = 'thread-1') {
  return fromMock({ select: { data: { thread_id: threadId }, error: null } });
}
function ensureDenied() {
  return fromMock({ select: { data: null, error: null } });
}

describe('Chat Routes (new feature: emergency chat + attachments + read receipts)', () => {
  beforeEach(() => {
    mockServiceSupabase.from.mockReset();
    mockServiceSupabase.storage.from.mockReset();
    mockResolveProfileByEmail.mockReset();
    (supabase.auth.getUser as jest.Mock).mockReset();
    mockAuthAs();
    mockResolveProfileByEmail.mockResolvedValue(officerActor);
    mockServiceSupabase.storage.from.mockReturnValue({
      upload: jest.fn().mockResolvedValue({ error: null }),
      getPublicUrl: jest.fn().mockReturnValue({
        data: { publicUrl: 'https://supabase.example/chat/file.pdf' },
      }),
    });
  });

  describe('auth', () => {
    it('returns 401 without a token', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: null }, error: { message: 'Invalid token' },
      });
      const res = await request(app).get('/api/chat/threads');
      expect(res.status).toBe(401);
    });

    it('returns 403 when the profile cannot be resolved to a chat actor', async () => {
      mockResolveProfileByEmail.mockResolvedValue(null);
      const res = await request(app).get('/api/chat/contacts/officers').set('Authorization', 'Bearer t');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Chat access denied');
    });
  });

  describe('GET /api/chat/contacts/officers', () => {
    it('returns only active officers', async () => {
      mockServiceSupabase.from.mockReturnValue(fromMock({
        select: {
          data: [
            { officer_id: 11, officer_name: 'John', officer_surname: 'Doe', badge_number: 'B11', officer_email_address: 'john@example.com', officer_employment_status: 'Active' },
            { officer_id: 12, officer_name: 'Jane', officer_surname: 'Roe', badge_number: 'B12', officer_email_address: 'jane@example.com', officer_employment_status: 'Inactive' },
            { officer_id: 13, officer_name: 'Bob', officer_surname: 'Smith', badge_number: 'B13', officer_email_address: 'bob@example.com', officer_employment_status: 'Active' },
          ],
          error: null,
        },
      }));

      const res = await request(app).get('/api/chat/contacts/officers').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.map((c: any) => c.officerId).sort()).toEqual([11, 13]);
    });

    it('filters by ?q across name, badge and email', async () => {
      mockServiceSupabase.from.mockReturnValue(fromMock({
        select: {
          data: [
            { officer_id: 11, officer_name: 'John', officer_surname: 'Doe', badge_number: 'B11', officer_email_address: 'john@example.com', officer_employment_status: 'Active' },
            { officer_id: 13, officer_name: 'Bob', officer_surname: 'Smith', badge_number: 'B13', officer_email_address: 'bob@example.com', officer_employment_status: 'Active' },
          ],
          error: null,
        },
      }));

      const res = await request(app).get('/api/chat/contacts/officers?q=bob').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ officerId: 13 });
    });

    it('returns 500 when the contacts query fails', async () => {
      mockServiceSupabase.from.mockReturnValue(fromMock({ select: { data: null, error: { message: 'DB down' } } }));
      const res = await request(app).get('/api/chat/contacts/officers').set('Authorization', 'Bearer t');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB down');
    });
  });

  describe('POST /api/chat/threads/emergency', () => {
    it('returns 400 when no recipients are provided', async () => {
      const res = await request(app).post('/api/chat/threads/emergency').set('Authorization', 'Bearer t').send({ title: 'Help', includeSuperUsers: false });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Provide recipients');
    });

    it('returns 400 when an officer includes their own id', async () => {
      const res = await request(app).post('/api/chat/threads/emergency').set('Authorization', 'Bearer t').send({ officerIds: [11], title: 'Help' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Do not include your own officer id');
    });

    it('returns 404 when officer recipients are missing or inactive', async () => {
      mockServiceSupabase.from.mockReturnValue(fromMock({ select: { data: [], error: null } }));
      const res = await request(app).post('/api/chat/threads/emergency').set('Authorization', 'Bearer t').send({ officerIds: [999], includeSuperUsers: false });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found or are inactive');
    });

    it('creates an emergency thread with officers (dedupes + returns id)', async () => {
      const officerRows = [
        { officer_id: 12, officer_name: 'Jane', officer_surname: 'Roe', badge_number: 'B12', role_id: 1, officer_employment_status: 'Active' },
      ];
      mockServiceSupabase.from
        .mockReturnValueOnce(fromMock({ select: { data: officerRows, error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: [], error: null } }))
        .mockReturnValueOnce(fromMock({ insert: { data: { id: 'thread-123' }, error: null } }))
        .mockReturnValueOnce(fromMock({ insert: { error: null } }));

      const res = await request(app).post('/api/chat/threads/emergency').set('Authorization', 'Bearer t').send({ officerIds: [12], title: 'Need backup', includeSuperUsers: false });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 'thread-123' });

      const threadInsert = mockServiceSupabase.from.mock.results[2].value.insert as jest.Mock;
      expect(threadInsert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'emergency', created_by_source: 'officer_users', created_by_id: 11 }));
      const participantsInsert = mockServiceSupabase.from.mock.results[3].value.insert as jest.Mock;
      const rows = participantsInsert.mock.calls[0][0] as any[];
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.participant_id).sort()).toEqual([11, 12]);
    });

    it('reuses an existing emergency thread with the same participant set', async () => {
      const officerRows = [
        { officer_id: 12, officer_name: 'Jane', officer_surname: 'Roe', badge_number: 'B12', role_id: 1, officer_employment_status: 'Active' },
      ];
      mockServiceSupabase.from
        .mockReturnValueOnce(fromMock({ select: { data: officerRows, error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: [{ thread_id: 'thread-existing' }], error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: [{ id: 'thread-existing', updated_at: '2026-09-01T10:00:00Z' }], error: null } }))
        .mockReturnValueOnce(fromMock({
          select: {
            data: [
              { thread_id: 'thread-existing', participant_source: 'officer_users', participant_id: 11 },
              { thread_id: 'thread-existing', participant_source: 'officer_users', participant_id: 12 },
            ],
            error: null,
          },
        }));

      const res = await request(app).post('/api/chat/threads/emergency').set('Authorization', 'Bearer t').send({ officerIds: [12], includeSuperUsers: false });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 'thread-existing' });
    });
  });

  describe('GET /api/chat/threads', () => {
    it('returns [] when the actor has no participations', async () => {
      mockServiceSupabase.from.mockReturnValueOnce(fromMock({ select: { data: [], error: null } }));
      const res = await request(app).get('/api/chat/threads').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns threads with latest message + unread count, dropping empty threads', async () => {
      const ownParticipation = {
        thread_id: 'thread-1', participant_source: 'officer_users', participant_id: 11,
        role_id: 1, display_name: 'John Doe', badge_number: 'B11', last_read_at: null,
      };
      const threadRow = {
        id: 'thread-1', kind: 'emergency', title: 'Need backup',
        created_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-01T10:00:00Z',
      };
      const participantRows = [
        ownParticipation,
        { thread_id: 'thread-1', participant_source: 'officer_users', participant_id: 12, role_id: 1, display_name: 'Jane Roe', badge_number: 'B12', last_read_at: null },
      ];
      const latestMessage = {
        id: 99, body: 'On my way', sender_name: 'Jane Roe',
        created_at: '2026-09-01T10:00:00Z', is_emergency: true, priority: 'high',
      };

      mockServiceSupabase.from
        .mockReturnValueOnce(fromMock({ select: { data: [ownParticipation], error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: [threadRow], error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: participantRows, error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: latestMessage, error: null } }))
        .mockReturnValueOnce(fromMock({ select: { count: 1, error: null } }));

      const res = await request(app).get('/api/chat/threads').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ id: 'thread-1', unreadCount: 1, latestMessage: expect.objectContaining({ id: 99 }) });
      expect(res.body[0].participants).toHaveLength(2);
    });

    it('filters out threads with no messages yet', async () => {
      const ownParticipation = {
        thread_id: 'thread-empty', participant_source: 'officer_users', participant_id: 11,
        role_id: 1, display_name: 'John Doe', badge_number: 'B11', last_read_at: null,
      };
      mockServiceSupabase.from
        .mockReturnValueOnce(fromMock({ select: { data: [ownParticipation], error: null } }))
        .mockReturnValueOnce(fromMock({
          select: { data: [{ id: 'thread-empty', kind: 'emergency', title: null, created_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-01T09:00:00Z' }], error: null },
        }))
        .mockReturnValueOnce(fromMock({ select: { data: [ownParticipation], error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: null, error: null } }))
        .mockReturnValueOnce(fromMock({ select: { count: 0, error: null } }));

      const res = await request(app).get('/api/chat/threads').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/chat/threads/:threadId/messages', () => {
    const participantRows = [
      { thread_id: 'thread-1', participant_source: 'officer_users', participant_id: 11, role_id: 1, display_name: 'John Doe', badge_number: 'B11', last_read_at: '2026-09-01T11:00:00Z' },
    ];

    function mockFetchMessages(messageRows: any[], opts: { readReceipts?: any[]; attachments?: any[]; attachmentReads?: any[] } = {}) {
      mockServiceSupabase.from
        .mockReturnValueOnce(ensureOk())
        .mockReturnValueOnce(fromMock({ select: { data: messageRows, error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: participantRows, error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: opts.readReceipts ?? [], error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: opts.attachments ?? [], error: null } }));
      if ((opts.attachments ?? []).length > 0) {
        mockServiceSupabase.from.mockReturnValueOnce(fromMock({ select: { data: opts.attachmentReads ?? [], error: null } }));
      }
    }

    it('returns 403 for non-participants', async () => {
      mockServiceSupabase.from.mockReturnValueOnce(ensureDenied());
      const res = await request(app).get('/api/chat/threads/thread-1/messages?markRead=false').set('Authorization', 'Bearer t');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Thread access denied');
    });

    it('returns messages with reply threading, seen counts and attachments (markRead=false)', async () => {
      const messageRows = [
        { id: 1, thread_id: 'thread-1', reply_to_message_id: null, sender_source: 'officer_users', sender_id: 12, sender_role_id: 1, sender_name: 'Jane Roe', body: 'Need backup at Allandale', is_emergency: true, priority: 'high', created_at: '2026-09-01T10:00:00Z' },
        { id: 2, thread_id: 'thread-1', reply_to_message_id: 1, sender_source: 'officer_users', sender_id: 11, sender_role_id: 1, sender_name: 'John Doe', body: 'On my way', is_emergency: true, priority: 'medium', created_at: '2026-09-01T10:01:00Z' },
      ];
      mockFetchMessages(messageRows, {
        attachments: [{ id: 10, message_id: 1, file_name: 'scene.jpg', file_type: 'image/jpeg', file_size: 1234, storage_path: 'p', storage_url: 'https://x/scene.jpg', created_at: '2026-09-01T10:00:00Z' }],
      });

      const res = await request(app).get('/api/chat/threads/thread-1/messages?markRead=false&limit=50').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({ id: 1, body: 'Need backup at Allandale', priority: 'high' });
      expect(res.body[0].attachments).toHaveLength(1);
      expect(res.body[0].attachments[0]).toMatchObject({ fileName: 'scene.jpg', openedCount: 0 });
      expect(res.body[1].replyTo).toMatchObject({ id: 1, senderName: 'Jane Roe' });
      expect(res.body[1]).toHaveProperty('seenBy');
    });

    it('clamps limit and still returns messages', async () => {
      mockFetchMessages([]);
      const res = await request(app).get('/api/chat/threads/thread-1/messages?markRead=false&limit=9999').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /api/chat/threads/:threadId/messages', () => {
    const insertedMessage = {
      id: 42, thread_id: 'thread-1', reply_to_message_id: null,
      sender_source: 'officer_users', sender_id: 11, sender_role_id: 1, sender_name: 'John Doe',
      body: 'Backup needed', is_emergency: true, priority: 'high', created_at: '2026-09-01T10:05:00Z',
    };

    function mockSendSuccess(inserted: any, attachmentRows: any[] = []) {
      const hasAttachments = attachmentRows.length > 0;
      mockServiceSupabase.from.mockReturnValueOnce(ensureOk());
      mockServiceSupabase.from.mockReturnValueOnce(fromMock({ insert: { data: inserted, error: null } }));
      if (hasAttachments) {
        mockServiceSupabase.from.mockReturnValueOnce(fromMock({ insert: { data: attachmentRows, error: null } }));
      }
      mockServiceSupabase.from
        .mockReturnValueOnce(fromMock({ select: { data: [{ thread_id: 'thread-1', participant_source: 'officer_users', participant_id: 11, role_id: 1, display_name: 'John Doe', badge_number: 'B11' }], error: null } }))
        .mockReturnValueOnce(fromMock({ update: { error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: [{ id: inserted.id, sender_source: 'officer_users', sender_id: 11 }], error: null } }))
        .mockReturnValueOnce(fromMock({ upsert: { error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: [inserted], error: null } }))
        .mockReturnValueOnce(fromMock({
          select: {
            data: [{ thread_id: 'thread-1', participant_source: 'officer_users', participant_id: 11, role_id: 1, display_name: 'John Doe', badge_number: 'B11', last_read_at: '2026-09-01T11:00:00Z' }],
            error: null,
          },
        }))
        .mockReturnValueOnce(fromMock({ select: { data: [], error: null } }));
    }

    it('sends a message with priority and returns seen metadata', async () => {
      mockSendSuccess(insertedMessage);
      const res = await request(app).post('/api/chat/threads/thread-1/messages').set('Authorization', 'Bearer t').send({ body: 'Backup needed', priority: 'high' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 42, body: 'Backup needed', priority: 'high' });
      expect(res.body.sender).toMatchObject({ participantId: 11, name: 'John Doe' });
      expect(res.body).toHaveProperty('seenBy');
      expect(res.body).toHaveProperty('attachments');
    });

    it('defaults unknown priority to medium and accepts attachments payload', async () => {
      const withAttachment = { ...insertedMessage, id: 43, priority: 'medium' };
      mockSendSuccess(withAttachment, [
        { id: 7, message_id: 43, file_name: 'doc.pdf', file_type: 'application/pdf', file_size: 100, storage_path: 'p', storage_url: 'u', created_at: '2026-09-01T10:05:00Z' },
      ]);

      const res = await request(app).post('/api/chat/threads/thread-1/messages').set('Authorization', 'Bearer t').send({
        body: 'See attached', priority: 'urgent',
        attachments: [{ fileName: 'doc.pdf', fileType: 'application/pdf', fileSize: 100, storagePath: 'p', storageUrl: 'u' }],
      });
      expect(res.status).toBe(201);
      expect(res.body.priority).toBe('medium');
      expect(res.body.attachments).toHaveLength(1);
      expect(res.body.attachments[0]).toMatchObject({ fileName: 'doc.pdf' });
    });

    it('returns 400 when body and attachments are both empty', async () => {
      const res = await request(app).post('/api/chat/threads/thread-1/messages').set('Authorization', 'Bearer t').send({ body: '   ' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Message body or attachments are required');
    });

    it('returns 400 when the body exceeds 4000 chars', async () => {
      const res = await request(app).post('/api/chat/threads/thread-1/messages').set('Authorization', 'Bearer t').send({ body: 'x'.repeat(4001) });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('4000');
    });

    it('returns 403 for non-participants', async () => {
      mockServiceSupabase.from.mockReturnValueOnce(ensureDenied());
      const res = await request(app).post('/api/chat/threads/thread-1/messages').set('Authorization', 'Bearer t').send({ body: 'Hello' });
      expect(res.status).toBe(403);
    });

    it('returns 400 when reply target is not in this thread', async () => {
      mockServiceSupabase.from
        .mockReturnValueOnce(ensureOk())
        .mockReturnValueOnce(fromMock({ select: { data: null, error: null } }));
      const res = await request(app).post('/api/chat/threads/thread-1/messages').set('Authorization', 'Bearer t').send({ body: 'Reply?', replyToMessageId: 999 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Reply target');
    });
  });

  describe('POST /api/chat/threads/:threadId/read + seen-debug', () => {
    it('marks a thread as read', async () => {
      mockServiceSupabase.from
        .mockReturnValueOnce(ensureOk())
        .mockReturnValueOnce(fromMock({ select: { data: [{ thread_id: 'thread-1', participant_source: 'officer_users', participant_id: 11, role_id: 1, display_name: 'John Doe', badge_number: 'B11' }], error: null } }))
        .mockReturnValueOnce(fromMock({ update: { error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: [], error: null } }))
        .mockReturnValueOnce(fromMock({ upsert: { error: null } }));
      const res = await request(app).post('/api/chat/threads/thread-1/read').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('returns 403 on read for non-participants', async () => {
      mockServiceSupabase.from.mockReturnValueOnce(ensureDenied());
      const res = await request(app).post('/api/chat/threads/thread-1/read').set('Authorization', 'Bearer t');
      expect(res.status).toBe(403);
    });

    it('validates seen-debug ids', async () => {
      const res = await request(app).get('/api/chat/threads/thread-1/messages/abc/seen-debug').set('Authorization', 'Bearer t');
      expect(res.status).toBe(400);
    });

    it('returns 404 from seen-debug when the message is missing', async () => {
      mockServiceSupabase.from
        .mockReturnValueOnce(ensureOk())
        .mockReturnValueOnce(fromMock({ select: { data: [{ thread_id: 'thread-1', participant_source: 'officer_users', participant_id: 11, role_id: 1, display_name: 'John Doe', badge_number: 'B11' }], error: null } }))
        .mockReturnValueOnce(fromMock({ update: { error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: [], error: null } }))
        .mockReturnValueOnce(fromMock({ upsert: { error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: null, error: null } }));
      const res = await request(app).get('/api/chat/threads/thread-1/messages/42/seen-debug').set('Authorization', 'Bearer t');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Message not found in thread');
    });
  });

  describe('attachments', () => {
    it('returns 400 when no files are uploaded', async () => {
      const res = await request(app).post('/api/chat/attachments/upload').set('Authorization', 'Bearer t');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No files provided');
    });

    it('uploads allowed files to chat-files storage', async () => {
      const upload = jest.fn().mockResolvedValue({ error: null, data: { path: 'p' } });
      const getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://supabase.example/chat/a.pdf' } });
      mockServiceSupabase.storage.from.mockReturnValue({ upload, getPublicUrl });

      const res = await request(app).post('/api/chat/attachments/upload').set('Authorization', 'Bearer t')
        .attach('files', Buffer.from('pdf-bytes'), { filename: 'report.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(201);
      expect(res.body.files).toHaveLength(1);
      expect(res.body.files[0]).toMatchObject({ fileName: 'report.pdf', fileType: 'application/pdf' });
      expect(mockServiceSupabase.storage.from).toHaveBeenCalledWith('chat-files');
      expect(upload).toHaveBeenCalled();
    });

    it('rejects disallowed file types', async () => {
      const res = await request(app).post('/api/chat/attachments/upload').set('Authorization', 'Bearer t')
        .attach('files', Buffer.from('exe'), { filename: 'evil.exe', contentType: 'application/x-msdownload' });
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('not allowed');
    });

    it('records attachment opens for participants only', async () => {
      mockServiceSupabase.from
        .mockReturnValueOnce(fromMock({ select: { data: { id: 5, message_id: 42 }, error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: { thread_id: 'thread-1' }, error: null } }))
        .mockReturnValueOnce(ensureOk())
        .mockReturnValueOnce(fromMock({ upsert: { error: null } }));
      const res = await request(app).post('/api/chat/attachments/5/opened').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('returns 400 for invalid attachment ids and 404 for missing attachments', async () => {
      const bad = await request(app).post('/api/chat/attachments/abc/opened').set('Authorization', 'Bearer t');
      expect(bad.status).toBe(400);
      mockServiceSupabase.from.mockReturnValueOnce(fromMock({ select: { data: null, error: null } }));
      const missing = await request(app).post('/api/chat/attachments/999/opened').set('Authorization', 'Bearer t');
      expect(missing.status).toBe(404);
    });
  });

  describe('DELETE /api/chat/threads/empty', () => {
    it('deletes emergency threads with no messages', async () => {
      mockServiceSupabase.from
        .mockReturnValueOnce(fromMock({ select: { data: [{ id: 't-empty' }, { id: 't-full' }], error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: [{ thread_id: 't-full' }], error: null } }))
        .mockReturnValueOnce(fromMock({ del: { error: null } }));
      const res = await request(app).delete('/api/chat/threads/empty').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: 1 });
    });

    it('returns deleted:0 when every thread has messages', async () => {
      mockServiceSupabase.from
        .mockReturnValueOnce(fromMock({ select: { data: [{ id: 't-full' }], error: null } }))
        .mockReturnValueOnce(fromMock({ select: { data: [{ thread_id: 't-full' }], error: null } }));
      const res = await request(app).delete('/api/chat/threads/empty').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: 0 });
    });
  });

  describe('supervisor actor', () => {
    it('allows supervisors to use chat (resolveActor accepts all roles)', async () => {
      mockResolveProfileByEmail.mockResolvedValue(supervisorActor);
      mockAuthAs('supervisor@example.com', 'sup-123');
      mockServiceSupabase.from.mockReturnValue(fromMock({ select: { data: [], error: null } }));
      const res = await request(app).get('/api/chat/contacts/officers').set('Authorization', 'Bearer t');
      expect(res.status).toBe(200);
    });
  });
});
