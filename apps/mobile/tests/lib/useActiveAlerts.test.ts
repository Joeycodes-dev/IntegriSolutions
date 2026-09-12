import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useActiveAlerts } from '../../src/lib/useActiveAlerts';
import * as api from '../../src/services/api';

jest.mock('../../src/services/api', () => ({
  getActiveAlerts: jest.fn(),
  acknowledgeAlert: jest.fn()
}));

const alertFixture = {
  id: 'alert-1',
  alertType: 'general',
  priority: 'high',
  description: 'Be advised: flooding on N1',
  vehicleRegistration: null,
  vehicleDescription: null,
  personName: null,
  personDescription: null,
  personReference: null,
  photoUrl: null,
  locationLat: null,
  locationLng: null,
  locationLabel: null,
  issuedByName: 'supervisor',
  targetScope: 'all_officers',
  sourceType: 'internal',
  sourceAuthority: null,
  sourceReference: null,
  status: 'active',
  expiresAt: null,
  createdAt: '2026-09-11T10:00:00Z',
  acknowledgedAt: null
};

describe('useActiveAlerts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refresh() fetches active alerts via the existing alerts API (no duplicated fetch logic)', async () => {
    (api.getActiveAlerts as jest.Mock).mockResolvedValue([alertFixture]);
    const { result } = renderHook(() => useActiveAlerts());

    await act(async () => {
      await result.current.refresh();
    });

    expect(api.getActiveAlerts).toHaveBeenCalledTimes(1);
    expect(result.current.alerts).toEqual([alertFixture]);
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error message when the fetch fails', async () => {
    (api.getActiveAlerts as jest.Mock).mockRejectedValue(new Error('Network down'));
    const { result } = renderHook(() => useActiveAlerts());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe('Network down');
  });

  it('acknowledge() calls the existing acknowledgeAlert API and updates the alert in place', async () => {
    (api.getActiveAlerts as jest.Mock).mockResolvedValue([alertFixture]);
    (api.acknowledgeAlert as jest.Mock).mockResolvedValue({ alertId: 'alert-1', acknowledgedAt: '2026-09-11T10:05:00Z' });

    const { result } = renderHook(() => useActiveAlerts());
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.alerts[0].acknowledgedAt).toBeNull();

    await act(async () => {
      await result.current.acknowledge('alert-1');
    });

    expect(api.acknowledgeAlert).toHaveBeenCalledWith('alert-1');
    await waitFor(() => {
      expect(result.current.alerts[0].acknowledgedAt).toBe('2026-09-11T10:05:00Z');
    });
    // Only the acknowledged alert's field changes — nothing else is refetched.
    expect(api.getActiveAlerts).toHaveBeenCalledTimes(1);
  });
});
