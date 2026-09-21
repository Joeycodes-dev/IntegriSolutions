import * as SecureStore from 'expo-secure-store';
import {
  setAccessToken,
  getAccessToken,
  clearAccessToken,
  saveProfile,
  getStoredProfile,
  clearStoredProfile
} from '../../src/services/auth';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn()
}));

const TOKEN_KEY = 'integiscan_auth_token';
const PROFILE_KEY = 'integiscan_user_profile';

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

describe('native services/auth (expo-secure-store backed)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('setAccessToken delegates to SecureStore.setItemAsync with the token key', async () => {
    await setAccessToken('tok-123');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEY, 'tok-123');
  });

  it('getAccessToken delegates to SecureStore.getItemAsync', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('tok-123');
    const token = await getAccessToken();
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
    expect(token).toBe('tok-123');
  });

  it('clearAccessToken delegates to SecureStore.deleteItemAsync', async () => {
    await clearAccessToken();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
  });

  it('saveProfile delegates to SecureStore.setItemAsync with the serialized profile', async () => {
    await saveProfile(sampleProfile);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(PROFILE_KEY, JSON.stringify(sampleProfile));
  });

  it('getStoredProfile delegates to SecureStore.getItemAsync and parses the result', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(sampleProfile));
    const profile = await getStoredProfile();
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(PROFILE_KEY);
    expect(profile).toEqual(sampleProfile);
  });

  it('clearStoredProfile delegates to SecureStore.deleteItemAsync', async () => {
    await clearStoredProfile();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(PROFILE_KEY);
  });
});
