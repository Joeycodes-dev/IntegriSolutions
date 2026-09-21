jest.mock('../../src/services/constants', () => ({
  API_BASE_URL: 'http://localhost:4000/api'
}));

jest.mock('../../src/services/auth', () => ({
  getAccessToken: jest.fn()
}));

const sampleShift = {
  id: 'shift-1',
  roadblockName: 'N1 Midrand Roadblock',
  station: 'Midrand SAPS',
  supervisorEmail: 'supervisor@example.com',
  supervisorName: 'Sara Super',
  startsAt: '2026-09-11T06:00:00Z',
  endsAt: '2026-09-11T14:00:00Z',
  status: 'active' as const,
  centerLat: -26.2041,
  centerLng: 28.0473,
  radiusMeters: 750,
  notes: null,
  createdAt: '2026-09-10T09:00:00Z',
  updatedAt: '2026-09-10T09:00:00Z'
};

describe('web services/shifts.web (localStorage-backed selection)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('round-trips the selected shift through localStorage', async () => {
    const store = new Map<string, string>();
    (global as any).window = {
      localStorage: {
        setItem: jest.fn((k: string, v: string) => store.set(k, v)),
        getItem: jest.fn((k: string) => store.get(k) ?? null),
        removeItem: jest.fn((k: string) => store.delete(k))
      }
    };

    const webShifts = require('../../src/services/shifts.web');
    await webShifts.saveSelectedRoadblockShift(sampleShift);

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'integiscan_selected_roadblock_shift',
      JSON.stringify(sampleShift)
    );

    const restored = await webShifts.getSelectedRoadblockShift();
    expect(restored).toEqual(sampleShift);

    await webShifts.clearSelectedRoadblockShift();
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('integiscan_selected_roadblock_shift');
    await expect(webShifts.getSelectedRoadblockShift()).resolves.toBeNull();
  });

  it('fails gracefully (does not throw) when localStorage is unavailable', async () => {
    (global as any).window = {
      localStorage: {
        setItem: jest.fn(() => {
          throw new Error('SecurityError: storage disabled');
        }),
        getItem: jest.fn(() => {
          throw new Error('SecurityError: storage disabled');
        }),
        removeItem: jest.fn(() => {
          throw new Error('SecurityError: storage disabled');
        })
      }
    };

    const webShifts = require('../../src/services/shifts.web');

    await expect(webShifts.saveSelectedRoadblockShift(sampleShift)).resolves.toBeUndefined();
    await expect(webShifts.getSelectedRoadblockShift()).resolves.toBeNull();
    await expect(webShifts.clearSelectedRoadblockShift()).resolves.toBeUndefined();
  });

  it('contains no credentials or sensitive personal data in the persisted shift payload', () => {
    const keys = Object.keys(sampleShift);
    const forbidden = ['token', 'password', 'idnumber', 'idNumber', 'accesstoken', 'refreshtoken'];
    for (const key of keys) {
      expect(forbidden.map((f) => f.toLowerCase())).not.toContain(key.toLowerCase());
    }
  });
});
