import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('services/api auth storage (memory-only, no browser storage)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('getAccessToken() is null on a fresh module load (simulates a page reload)', async () => {
    const api = await import('../../src/services/api');
    expect(api.getAccessToken()).toBeNull();
  });

  it('setAccessToken()/getAccessToken() round-trip in memory', async () => {
    const api = await import('../../src/services/api');
    api.setAccessToken('tok-123');
    expect(api.getAccessToken()).toBe('tok-123');
  });

  it('setAccessToken() never writes to localStorage or sessionStorage', async () => {
    const api = await import('../../src/services/api');
    api.setAccessToken('tok-123');

    expect(localStorage.getItem('backend_access_token')).toBeNull();
    expect(sessionStorage.getItem('backend_access_token')).toBeNull();
    expect(Object.keys(localStorage)).not.toContain('backend_access_token');

    const allValues = Object.keys(localStorage).map((k) => localStorage.getItem(k)).join('\n');
    expect(allValues).not.toContain('tok-123');
  });

  it('clearAccessToken() resets the in-memory token and touches no storage', async () => {
    const api = await import('../../src/services/api');
    api.setAccessToken('tok-123');
    api.clearAccessToken();

    expect(api.getAccessToken()).toBeNull();
    expect(localStorage.getItem('backend_access_token')).toBeNull();
  });

  it('setActorRoleId() never writes to localStorage or sessionStorage', async () => {
    const api = await import('../../src/services/api');
    api.setActorRoleId(2);

    expect(localStorage.getItem('local_auth_profile')).toBeNull();
    expect(Object.keys(localStorage)).toHaveLength(0);
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });

  it('a page reload (fresh module instance) loses a previously set token — requires re-authentication', async () => {
    const firstLoad = await import('../../src/services/api');
    firstLoad.setAccessToken('tok-123');
    expect(firstLoad.getAccessToken()).toBe('tok-123');

    vi.resetModules();
    const secondLoad = await import('../../src/services/api');

    expect(secondLoad.getAccessToken()).toBeNull();
  });

  it('an authenticated request still carries the in-memory bearer token and role header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const api = await import('../../src/services/api');
    api.setAccessToken('tok-123');
    api.setActorRoleId(3);

    await api.getAuditLogs();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-123');
    expect(headers['X-Actor-Role-Id']).toBe('3');

    vi.unstubAllGlobals();
  });
});
