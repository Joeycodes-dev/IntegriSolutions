import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function mockFetchJson(payload: unknown, ok = true, status = 200, statusText = 'OK') {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText,
    text: async () => JSON.stringify(payload),
  });
}

describe('road offence + chat api (new features)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function loadApi() {
    return await import('../../src/services/api');
  }

  it('getRoadOffences sends the bearer token and returns rows', async () => {
    localStorage.setItem('backend_access_token', 'tok-123');
    const rows = [{ id: 'off-1', offence_type: 'speeding' }];
    const fetchMock = mockFetchJson(rows);
    vi.stubGlobal('fetch', fetchMock);

    const api = await loadApi();
    const result = await api.getRoadOffences();

    expect(result).toEqual(rows);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/road-offences');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
  });

  it('getRoadOffences surfaces server error messages', async () => {
    localStorage.setItem('backend_access_token', 'tok-123');
    vi.stubGlobal('fetch', mockFetchJson({ error: 'Only supervisor accounts can review' }, false, 403, 'Forbidden'));

    const api = await loadApi();
    await expect(api.getRoadOffences()).rejects.toThrow('Only supervisor accounts can review');
  });

  it('addRoadOffenceReview POSTs action + reason to the encoded review URL', async () => {
    localStorage.setItem('backend_access_token', 'tok-123');
    localStorage.setItem('local_auth_profile', JSON.stringify({ roleId: 2 }));
    const saved = { id: 5, action: 'verified' };
    const fetchMock = mockFetchJson(saved);
    vi.stubGlobal('fetch', fetchMock);

    const api = await loadApi();
    const result = await api.addRoadOffenceReview('off/123', 'verified', 'Confirmed via CCTV');

    expect(result).toEqual(saved);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/road-offences/off%2F123/reviews');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ action: 'verified', reason: 'Confirmed via CCTV' });
  });

  it('getChatThreads + createEmergencyChatThread hit the chat endpoints', async () => {
    localStorage.setItem('backend_access_token', 'tok-123');
    localStorage.setItem('local_auth_profile', JSON.stringify({ roleId: 1 }));
    const threads = [{ id: 't-1' }];
    const fetchMock = mockFetchJson(threads);
    vi.stubGlobal('fetch', fetchMock);

    const api = await loadApi();
    expect(await api.getChatThreads()).toEqual(threads);

    fetchMock.mockResolvedValueOnce({
      ok: true, status: 201, statusText: 'Created',
      text: async () => JSON.stringify({ id: 't-new' }),
    });
    const created = await api.createEmergencyChatThread({ officerIds: [12], title: 'Need backup' });
    expect(created).toEqual({ id: 't-new' });
    const [, createInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(createInit.method).toBe('POST');
    expect(JSON.parse(createInit.body as string)).toMatchObject({ officerIds: [12] });
  });

  it('getChatThreadMessages clamps limit, encodes the thread id and toggles markRead', async () => {
    localStorage.setItem('backend_access_token', 'tok-123');
    localStorage.setItem('local_auth_profile', JSON.stringify({ roleId: 1 }));
    const fetchMock = mockFetchJson([]);
    vi.stubGlobal('fetch', fetchMock);

    const api = await loadApi();
    await api.getChatThreadMessages('thread/1', 9999, false);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/chat/threads/thread%2F1/messages');
    expect(url).toContain('limit=200');
    expect(url).toContain('markRead=false');
  });

  it('sendChatMessage applies emergency/priority/reply/attachment defaults', async () => {
    localStorage.setItem('backend_access_token', 'tok-123');
    localStorage.setItem('local_auth_profile', JSON.stringify({ roleId: 1 }));
    const fetchMock = mockFetchJson({ id: 42 });
    vi.stubGlobal('fetch', fetchMock);

    const api = await loadApi();
    await api.sendChatMessage('t-1', 'Backup needed');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/chat/threads/t-1/messages');
    expect(JSON.parse(init.body as string)).toEqual({
      body: 'Backup needed',
      isEmergency: true,
      priority: 'medium',
      replyToMessageId: null,
      attachments: [],
    });
  });

  it('markChatThreadRead + markAttachmentOpened POST to the read-tracking endpoints', async () => {
    localStorage.setItem('backend_access_token', 'tok-123');
    localStorage.setItem('local_auth_profile', JSON.stringify({ roleId: 2 }));
    const fetchMock = mockFetchJson({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const api = await loadApi();
    await api.markChatThreadRead('t-1');
    await api.markAttachmentOpened(7);

    const [readUrl, readInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(readUrl).toContain('/api/chat/threads/t-1/read');
    expect(readInit.method).toBe('POST');
    const [openedUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(openedUrl).toContain('/api/chat/attachments/7/opened');
  });
});
