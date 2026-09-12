import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../src/lib/AuthContext';
import { AUTH_EXPIRED_EVENT } from '../../src/services/api';

// Mirrors the real services/api.ts storage model: token/profile in a plain
// module-level variable, never localStorage/sessionStorage.
let mockToken: string | null = null;

vi.mock('../../src/services/api', () => ({
  AUTH_EXPIRED_EVENT: 'integriscan:auth-expired',
  getAccessToken: vi.fn(() => mockToken),
  setAccessToken: vi.fn((token: string) => {
    mockToken = token;
  }),
  clearAccessToken: vi.fn(() => {
    mockToken = null;
  }),
  setActorRoleId: vi.fn(),
  getProfile: vi.fn(),
  getRuntimeConfig: vi.fn(() => Promise.reject(new Error('offline')))
}));

const mockProfile = {
  uid: 'abc-123',
  officerId: 1,
  email: 'officer@test.com',
  name: 'Test',
  surname: 'Officer',
  badgeNumber: 'B001',
  idNumber: 'ID001',
  employmentStatus: 'Active',
  province: 'TestProvince',
  region: 'TestRegion',
  officerTypeId: 1,
  roleId: 2,
  createdAt: '2026-01-01T00:00:00Z',
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthContext', () => {
  beforeEach(() => {
    mockToken = null;
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('resolves to unauthenticated on mount, simulating a page reload (no token to restore)', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it('ignores any pre-existing localStorage auth data left over from before this fix', async () => {
    // Simulate a browser that still has the old, now-unused keys from a prior
    // version of the app. They must never be read back into a live session.
    localStorage.setItem('local_auth_profile', JSON.stringify(mockProfile));
    localStorage.setItem('backend_access_token', 'stale-token');

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it('signIn keeps the token and profile in memory and never writes them to browser storage', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.signIn(mockProfile, 'test-jwt-token');
    });

    expect(result.current.user).toEqual(mockProfile);
    expect(result.current.profile).toEqual(mockProfile);

    // The token itself.
    expect(localStorage.getItem('backend_access_token')).toBeNull();
    expect(sessionStorage.getItem('backend_access_token')).toBeNull();

    // The full profile, and specifically its sensitive fields (national ID,
    // email) — must not appear anywhere in localStorage/sessionStorage.
    const allLocalStorageValues = Object.keys(localStorage).map((k) => localStorage.getItem(k)).join('\n');
    const allSessionStorageValues = Object.keys(sessionStorage).map((k) => sessionStorage.getItem(k)).join('\n');
    expect(allLocalStorageValues).not.toContain(mockProfile.idNumber);
    expect(allLocalStorageValues).not.toContain(mockProfile.email);
    expect(allLocalStorageValues).not.toContain('test-jwt-token');
    expect(allSessionStorageValues).not.toContain(mockProfile.idNumber);
    expect(allSessionStorageValues).not.toContain('test-jwt-token');
  });

  it('signOut clears in-memory auth state', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.signIn(mockProfile, 'old-token');
    });
    expect(result.current.user).toEqual(mockProfile);

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(mockToken).toBeNull();
  });

  it('clears in-memory auth state when the API reports an expired auth token', async () => {
    const api = await import('../../src/services/api');
    // AUTH_EXPIRED_EVENT triggers a revalidation call to getProfile(); simulate
    // the backend actually rejecting the now-expired token on that call.
    (api.getProfile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Invalid or expired access token')
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.signIn(mockProfile, 'expired-token');
    });
    expect(result.current.user).toEqual(mockProfile);

    act(() => {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { token: 'expired-token' } }));
    });

    await waitFor(() => {
      expect(result.current.user).toBeNull();
    });
    expect(result.current.profile).toBeNull();
    expect(mockToken).toBeNull();
  });
});
