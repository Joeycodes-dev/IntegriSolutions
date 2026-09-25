import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const expectedBytesHash = 'ff5d8507b6a72bee2debce2c0054798deaccdc5d8a1b945b6280ce8aa9cba52e';

function response(body: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 409 ? 'Conflict' : 'OK',
    text: async () => JSON.stringify(body)
  } as Response;
}

function makeFile() {
  return new File([new Uint8Array([0, 1, 2, 3, 255])], 'evidence.jpg', {
    type: 'image/jpeg'
  });
}

describe('web evidence upload client', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
    const api = await import('../../src/services/api');
    api.setAccessToken('test-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the exact-byte SHA-256, stable-key headers, category, and notes', async () => {
    const api = await import('../../src/services/api');
    const file = makeFile();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(response({ id: 1, photo_url: 'https://cdn.example/evidence.jpg' }, 201));

    await api.uploadEvidence('test-1', file, {
      category: 'licence_front',
      notes: 'Front of licence',
      idempotencyKey: 'evidence-stable-key-1234'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['Idempotency-Key']).toBe('evidence-stable-key-1234');
    expect(headers['X-Content-SHA256']).toBe(expectedBytesHash);
    expect(init.body).toBeInstanceOf(FormData);

    const form = init.body as FormData;
    expect(form.get('photo')).toBe(file);
    expect(form.get('category')).toBe('licence_front');
    expect(form.get('notes')).toBe('Front of licence');
    expect(form.get('idempotencyKey')).toBe('evidence-stable-key-1234');
    expect(form.get('contentHash')).toBe(expectedBytesHash);
  });

  it('retains the same key after a network failure', async () => {
    const api = await import('../../src/services/api');
    const file = makeFile();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response({ id: 1, photo_url: 'https://cdn.example/evidence.jpg' }, 201));

    await expect(api.uploadEvidence('test-1', file, { category: 'vehicle' })).rejects.toThrow('offline');
    await api.uploadEvidence('test-1', file, { category: 'vehicle' });

    const firstHeaders = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const secondHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(secondHeaders['Idempotency-Key']).toBe(firstHeaders['Idempotency-Key']);
  });

  it('retains the same key when a 409 is retried', async () => {
    const api = await import('../../src/services/api');
    const file = makeFile();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(response({ error: 'Idempotency key was already used with different evidence content' }, 409))
      .mockResolvedValueOnce(response({ id: 1, duplicate: true, photo_url: 'https://cdn.example/evidence.jpg' }, 200));

    await expect(api.uploadEvidence('test-1', file, {
      category: 'vehicle',
      notes: 'Retry me'
    })).rejects.toMatchObject({
      name: 'EvidenceUploadConflictError',
      status: 409
    });

    await api.uploadEvidence('test-1', file, {
      category: 'vehicle',
      notes: 'Retry me'
    });

    const firstInit = fetchMock.mock.calls[0][1] as RequestInit;
    const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
    const firstHeaders = firstInit.headers as Record<string, string>;
    const secondHeaders = secondInit.headers as Record<string, string>;
    expect(secondHeaders['Idempotency-Key']).toBe(firstHeaders['Idempotency-Key']);
    expect(secondHeaders['X-Content-SHA256']).toBe(expectedBytesHash);
  });

  it('rejects a supplied hash that does not describe the File bytes', async () => {
    const api = await import('../../src/services/api');
    const file = makeFile();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

    await expect(api.uploadEvidence('test-1', file, {
      contentHash: '0'.repeat(64),
      idempotencyKey: 'evidence-stable-key-1234'
    })).rejects.toThrow(/does not match/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
