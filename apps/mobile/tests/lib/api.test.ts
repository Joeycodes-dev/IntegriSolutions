import { uploadEvidencePhoto } from '../../src/services/api';
import { getAccessToken } from '../../src/services/auth';
import { logAuditEvent } from '../../src/services/audit';

jest.mock('../../src/services/auth', () => ({
  getAccessToken: jest.fn(),
  clearAccessToken: jest.fn(),
  getStoredProfile: jest.fn(),
}));

jest.mock('../../src/services/audit', () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/constants', () => ({
  API_BASE_URL: 'https://api.example.test/api',
}));

const authMock = jest.requireMock('../../src/services/auth');
const auditMock = jest.requireMock('../../src/services/audit');

const validIntegrity = {
  idempotencyKey: 'evidence-key-1234',
  contentHash: 'a'.repeat(64),
};

function okResponse() {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ id: 1 }),
  } as unknown as Response;
}

/** Headers actually handed to fetch for the nth call. */
function headersFromFetch(index = 0): Record<string, string> {
  const call = (global.fetch as jest.Mock).mock.calls[index];
  return call[1]?.headers as Record<string, string>;
}

describe('uploadEvidencePhoto authorization header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authMock.getAccessToken.mockResolvedValue('token-abc');
    authMock.getStoredProfile.mockResolvedValue({ roleId: 1 });
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(okResponse());
  });

  it('sends Authorization alongside the integrity headers', async () => {
    await uploadEvidencePhoto('test-1', 'file:///licence.jpg', 'licence_front', validIntegrity);

    // Regression: the caller passes Idempotency-Key / X-Content-SHA256, and
    // those must be merged with auth headers rather than replacing them.
    // Replacing them dropped Authorization entirely, and the backend answered
    // 401 "Authorization header missing or malformed" on every evidence upload.
    const headers = headersFromFetch();
    expect(headers.Authorization).toBe('Bearer token-abc');
    expect(headers['Idempotency-Key']).toBe('evidence-key-1234');
    expect(headers['X-Content-SHA256']).toBe('a'.repeat(64));
    expect(headers['X-Actor-Role-Id']).toBe('1');
  });

  it('never sends Content-Type for FormData bodies', async () => {
    await uploadEvidencePhoto('test-1', 'file:///licence.jpg', 'licence_front', validIntegrity);

    // Letting fetch set the boundary is required for multipart to parse.
    expect(headersFromFetch()['Content-Type']).toBeUndefined();
  });

  it('surfaces a missing token as an unauthenticated request, not a crash', async () => {
    authMock.getAccessToken.mockResolvedValue(null);

    await uploadEvidencePhoto('test-1', 'file:///licence.jpg', 'licence_front', validIntegrity);

    expect(headersFromFetch().Authorization).toBeUndefined();
    // Integrity headers survive even with no session.
    expect(headersFromFetch()['Idempotency-Key']).toBe('evidence-key-1234');
  });

  it('rejects an invalid integrity pair before touching the network', async () => {
    await expect(
      uploadEvidencePhoto('test-1', 'file:///licence.jpg', 'licence_front', {
        idempotencyKey: 'short',
        contentHash: 'not-a-hash',
      }),
    ).rejects.toThrow(/valid idempotency key and SHA-256/);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not retry evidence uploads unauthenticated after an expired token', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ error: 'Invalid or expired access token' }),
    } as unknown as Response);

    await expect(
      uploadEvidencePhoto('test-1', 'file:///licence.jpg', 'licence_front', validIntegrity),
    ).rejects.toMatchObject({ code: 'AUTH_EXPIRED' });

    // Uploading evidence anonymously is pointless, so this path fails closed
    // after exactly one attempt and asks for a fresh sign-in instead.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(authMock.clearAccessToken).toHaveBeenCalled();
  });
});

describe('expired session reporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authMock.getAccessToken.mockResolvedValue('token-abc');
    authMock.getStoredProfile.mockResolvedValue({ roleId: 1 });
    auditMock.logAuditEvent.mockResolvedValue(undefined);
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ error: 'Invalid or expired access token' }),
    } as unknown as Response);
  });

  it('fails fast with a sign-in prompt rather than an opaque 401', async () => {
    await expect(
      uploadEvidencePhoto('test-1', 'file:///licence.jpg', 'licence_front', validIntegrity),
    ).rejects.toMatchObject({ status: 401, code: 'AUTH_EXPIRED' });

    // The queue must be able to recognise this as "sign in", not a hard failure.
    await expect(
      uploadEvidencePhoto('test-1', 'file:///licence.jpg', 'licence_front', validIntegrity),
    ).rejects.toThrow(/sign in again/i);
  });

  it('does not treat a missing-token 401 as an expired session', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ error: 'Authorization header missing or malformed' }),
    } as unknown as Response);

    // This message must not wipe a perfectly valid session — it means the
    // request itself was malformed, which is a bug, not an expiry.
    await expect(
      uploadEvidencePhoto('test-1', 'file:///licence.jpg', 'licence_front', validIntegrity),
    ).rejects.toThrow(/Authorization header missing or malformed/);

    expect(authMock.clearAccessToken).not.toHaveBeenCalled();
  });
});
