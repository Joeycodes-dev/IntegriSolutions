import * as SecureStore from 'expo-secure-store';
import {
  saveSelectedRoadblockShift,
  getSelectedRoadblockShift,
  clearSelectedRoadblockShift,
  type RoadblockShift
} from '../../src/services/shifts';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn()
}));

jest.mock('../../src/services/auth', () => ({
  getAccessToken: jest.fn()
}));

const SELECTED_SHIFT_KEY = 'integiscan_selected_roadblock_shift';

const sampleShift: RoadblockShift = {
  id: 'shift-1',
  roadblockName: 'N1 Midrand Roadblock',
  station: 'Midrand SAPS',
  supervisorEmail: 'supervisor@example.com',
  supervisorName: 'Sara Super',
  startsAt: '2026-09-11T06:00:00Z',
  endsAt: '2026-09-11T14:00:00Z',
  status: 'active',
  centerLat: -26.2041,
  centerLng: 28.0473,
  radiusMeters: 750,
  notes: null,
  createdAt: '2026-09-10T09:00:00Z',
  updatedAt: '2026-09-10T09:00:00Z'
};

describe('native services/shifts (expo-secure-store backed selection)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saveSelectedRoadblockShift delegates to SecureStore.setItemAsync', async () => {
    await saveSelectedRoadblockShift(sampleShift);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SELECTED_SHIFT_KEY, JSON.stringify(sampleShift));
  });

  it('getSelectedRoadblockShift delegates to SecureStore.getItemAsync and parses the result', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(sampleShift));
    const shift = await getSelectedRoadblockShift();
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(SELECTED_SHIFT_KEY);
    expect(shift).toEqual(sampleShift);
  });

  it('clearSelectedRoadblockShift delegates to SecureStore.deleteItemAsync', async () => {
    await clearSelectedRoadblockShift();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SELECTED_SHIFT_KEY);
  });
});
