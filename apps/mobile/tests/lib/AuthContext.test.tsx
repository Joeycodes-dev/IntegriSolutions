import React from 'react';
import { Text, View } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('../../src/services/auth', () => ({
  getAccessToken: jest.fn(),
  getStoredProfile: jest.fn(),
  clearAccessToken: jest.fn().mockResolvedValue(undefined),
  clearStoredProfile: jest.fn().mockResolvedValue(undefined),
  setAccessToken: jest.fn(),
  saveProfile: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/api', () => ({
  onAuthExpired: jest.fn(() => jest.fn()),
}));
jest.mock('../../src/services/audit', () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/breathalyzer', () => ({
  breathalyzerSession: {
    disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

import { AuthProvider, useAuth } from '../../src/lib/AuthContext';

const mockAuthStorage = jest.requireMock('../../src/services/auth') as {
  getAccessToken: jest.Mock;
  getStoredProfile: jest.Mock;
  clearAccessToken: jest.Mock;
  clearStoredProfile: jest.Mock;
};

const profile = {
  uid: 'officer-uid-1',
  officerId: 1,
  email: 'officer@example.com',
  name: 'Test',
  surname: 'Officer',
  badgeNumber: 'B001',
  idNumber: '9001015800087',
  employmentStatus: 'Active',
  province: 'Gauteng',
  region: 'Johannesburg',
  officerTypeId: 1,
  roleId: 1,
  createdAt: '2026-09-24T00:00:00.000Z',
};

function AuthProbe() {
  const { profile: currentProfile, token, isRestoring } = useAuth();
  return (
    <View>
      <Text testID="state">
        {isRestoring
          ? 'restoring'
          : currentProfile
            ? `authenticated:${currentProfile.uid}:${token ?? 'offline'}`
            : 'signed-out'}
      </Text>
    </View>
  );
}

describe('AuthContext offline restoration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthStorage.clearAccessToken.mockResolvedValue(undefined);
    mockAuthStorage.clearStoredProfile.mockResolvedValue(undefined);
  });

  it('retains a stored officer session when profile validation is offline', async () => {
    mockAuthStorage.getAccessToken.mockResolvedValue('token-1');
    mockAuthStorage.getStoredProfile.mockResolvedValue(profile);
    (global as unknown as { fetch: jest.Mock }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline'));

    const { getByTestId } = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('state').props.children).toBe(
        'authenticated:officer-uid-1:token-1',
      );
    });
    expect(mockAuthStorage.clearAccessToken).not.toHaveBeenCalled();
  });

  it('clears a stored session on an explicit authentication rejection', async () => {
    mockAuthStorage.getAccessToken.mockResolvedValue('token-1');
    mockAuthStorage.getStoredProfile.mockResolvedValue(profile);
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    const { getByTestId } = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('state').props.children).toBe('signed-out');
    });
    expect(mockAuthStorage.clearAccessToken).toHaveBeenCalled();
    expect(mockAuthStorage.clearStoredProfile).toHaveBeenCalled();
  });
});
