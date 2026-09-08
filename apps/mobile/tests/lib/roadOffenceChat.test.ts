import { createRoadOffence, getChatThreadMessages, sendChatMessage, createEmergencyChatThread, getChatThreads, markChatThreadRead } from '../../src/services/api';
import * as auth from '../../src/services/auth';

jest.mock('../../src/services/auth', () => ({
  getAccessToken: jest.fn(),
  getStoredProfile: jest.fn(),
  clearAccessToken: jest.fn(),
}));

jest.mock('../../src/services/constants', () => ({
  API_BASE_URL: 'http://localhost:4000/api',
}));

jest.mock('../../src/services/audit', () => ({
  logAuditEvent: jest.fn(),
}));

function mockFetchJson(payload: unknown, ok = true, status = 200) {
  (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  });
}

describe('road offence + chat api (new mobile features)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth.getAccessToken as jest.Mock).mockResolvedValue('tok-123');
    (auth.getStoredProfile as jest.Mock).mockResolvedValue({ roleId: 1 });
    (global.fetch as any) = jest.fn();
  });

  it('createRoadOffence POSTs the immutable offence payload', async () => {
    mockFetchJson({ id: 'off-123' });
    const payload = {
      id: 'off-123',
      offenceType: 'speeding' as const,
      actionTaken: 'fine_or_notice' as const,
      driverName: 'Driver A',
      driverIdentifier: 'DL001',
      vehicleRegistration: 'ABC123GP',
      vehicleDescription: 'White Toyota',
      notes: 'Clocked at 140 in a 120 zone',
      referenceNumber: 'REF-1',
      location: { lat: -26.2, lng: 28.0 },
    };

    await createRoadOffence(payload);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/road-offences');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({
      id: 'off-123',
      offenceType: 'speeding',
      actionTaken: 'fine_or_notice',
    });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
  });

  it('createRoadOffence surfaces server validation errors', async () => {
    mockFetchJson({ error: 'Missing or invalid road offence payload' }, false, 400);
    await expect(
      createRoadOffence({
        id: '', offenceType: 'speeding' as const, actionTaken: 'fine_or_notice' as const,
        driverName: '', driverIdentifier: '', vehicleRegistration: '', vehicleDescription: '',
        notes: '', referenceNumber: '', location: { lat: 0, lng: 0 },
      })
    ).rejects.toThrow('Missing or invalid road offence payload');
  });

  it('getChatThreads fetches the officer emergency inbox', async () => {
    mockFetchJson([{ id: 't-1' }]);
    const threads = await getChatThreads();
    expect(threads).toEqual([{ id: 't-1' }]);
    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/chat/threads');
  });

  it('createEmergencyChatThread sends recipients for a new channel', async () => {
    mockFetchJson({ id: 't-new' });
    const created = await createEmergencyChatThread({ officerIds: [12], title: 'Need backup' });
    expect(created).toEqual({ id: 't-new' });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ officerIds: [12] });
  });

  it('getChatThreadMessages clamps the limit into 1..200 and encodes the id', async () => {
    mockFetchJson([]);
    await getChatThreadMessages('thread/1', 9999, false);
    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/chat/threads/thread%2F1/messages');
    expect(url).toContain('limit=200');
    expect(url).toContain('markRead=false');
  });

  it('sendChatMessage applies emergency/priority defaults', async () => {
    mockFetchJson({ id: 42 });
    await sendChatMessage('t-1', 'Backup needed');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      body: 'Backup needed',
      isEmergency: true,
      priority: 'medium',
      replyToMessageId: null,
      attachments: [],
    });
  });

  it('markChatThreadRead POSTs to the read endpoint', async () => {
    mockFetchJson({ ok: true });
    await markChatThreadRead('t-1');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/chat/threads/t-1/read');
    expect(init.method).toBe('POST');
  });
});
