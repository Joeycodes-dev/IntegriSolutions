import * as SecureStore from 'expo-secure-store';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn()
}));

jest.mock('../../src/services/constants', () => ({
  API_BASE_URL: 'http://localhost:4000/api'
}));

const sampleProfile = {
  uid: 'user-123',
  officerId: 23,
  email: 'officer@example.com',
  name: 'John',
  surname: 'Doe',
  badgeNumber: 'B123',
  idNumber: '9001015009087',
  employmentStatus: 'Active',
  province: 'Gauteng',
  region: 'Tshwane',
  officerTypeId: 1,
  roleId: 1,
  createdAt: '2026-05-30T09:00:00Z'
};

describe('web services/auth.web (expo-secure-store has no web backend)', () => {
  let localStorageSpy: { setItem: jest.Mock; getItem: jest.Mock; removeItem: jest.Mock };
  let sessionStorageSpy: { setItem: jest.Mock; getItem: jest.Mock; removeItem: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // Inject spy-able storage globals regardless of what the Jest test
    // environment provides by default, so "never writes" is asserted directly
    // rather than inferred from the environment lacking storage.
    localStorageSpy = { setItem: jest.fn(), getItem: jest.fn(), removeItem: jest.fn() };
    sessionStorageSpy = { setItem: jest.fn(), getItem: jest.fn(), removeItem: jest.fn() };
    (global as any).localStorage = localStorageSpy;
    (global as any).sessionStorage = sessionStorageSpy;
  });

  it('never calls expo-secure-store for token or profile storage', async () => {
    const webAuth = require('../../src/services/auth.web');

    await webAuth.setAccessToken('tok-123');
    await webAuth.getAccessToken();
    await webAuth.saveProfile(sampleProfile);
    await webAuth.getStoredProfile();
    await webAuth.clearAccessToken();
    await webAuth.clearStoredProfile();

    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('never writes the access token or profile to localStorage/sessionStorage', async () => {
    const webAuth = require('../../src/services/auth.web');

    await webAuth.setAccessToken('tok-123');
    await webAuth.saveProfile(sampleProfile);

    expect(localStorageSpy.setItem).not.toHaveBeenCalled();
    expect(sessionStorageSpy.setItem).not.toHaveBeenCalled();
  });

  it('keeps the token and profile in memory for the current module instance', async () => {
    const webAuth = require('../../src/services/auth.web');

    await webAuth.setAccessToken('tok-123');
    await webAuth.saveProfile(sampleProfile);

    await expect(webAuth.getAccessToken()).resolves.toBe('tok-123');
    await expect(webAuth.getStoredProfile()).resolves.toEqual(sampleProfile);
  });

  it('loses the token and profile when the module is reloaded (simulated page refresh) — requires re-authentication', async () => {
    const firstLoad = require('../../src/services/auth.web');
    await firstLoad.setAccessToken('tok-123');
    await firstLoad.saveProfile(sampleProfile);
    await expect(firstLoad.getAccessToken()).resolves.toBe('tok-123');

    // A page refresh re-evaluates the JS module graph from scratch; simulate
    // that by resetting the module registry and re-importing.
    jest.resetModules();
    const secondLoad = require('../../src/services/auth.web');

    await expect(secondLoad.getAccessToken()).resolves.toBeNull();
    await expect(secondLoad.getStoredProfile()).resolves.toBeNull();
  });

  it('clearAccessToken/clearStoredProfile reset the in-memory state without touching storage', async () => {
    const webAuth = require('../../src/services/auth.web');
    await webAuth.setAccessToken('tok-123');
    await webAuth.saveProfile(sampleProfile);

    await webAuth.clearAccessToken();
    await webAuth.clearStoredProfile();

    await expect(webAuth.getAccessToken()).resolves.toBeNull();
    await expect(webAuth.getStoredProfile()).resolves.toBeNull();
    expect(localStorageSpy.removeItem).not.toHaveBeenCalled();
  });

  it('login() still performs a normal network request (platform-agnostic behavior preserved)', async () => {
    (global.fetch as any) = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session: { access_token: 'tok-123' }, profile: sampleProfile })
    });

    const webAuth = require('../../src/services/auth.web');
    const result = await webAuth.login('officer@example.com', 'password123');

    expect(result).toEqual({ session: { access_token: 'tok-123' }, profile: sampleProfile });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/auth/login',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
