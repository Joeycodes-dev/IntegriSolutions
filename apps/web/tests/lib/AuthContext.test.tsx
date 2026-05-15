import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../src/lib/AuthContext';

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
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('resolves loading to false and user to null when no stored auth', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it('restores profile from localStorage on mount', async () => {
    localStorage.setItem('local_auth_profile', JSON.stringify(mockProfile));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(mockProfile);
    expect(result.current.profile).toEqual(mockProfile);
  });

  it('signIn stores profile and token in localStorage', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.signIn(mockProfile, 'test-jwt-token');
    });

    expect(result.current.user).toEqual(mockProfile);
    expect(localStorage.getItem('backend_access_token')).toBe('test-jwt-token');
    expect(localStorage.getItem('local_auth_profile')).toBe(JSON.stringify(mockProfile));
  });

  it('signOut clears profile and token from localStorage', async () => {
    localStorage.setItem('local_auth_profile', JSON.stringify(mockProfile));
    localStorage.setItem('backend_access_token', 'old-token');

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(localStorage.getItem('backend_access_token')).toBeNull();
    expect(localStorage.getItem('local_auth_profile')).toBeNull();
  });
});
