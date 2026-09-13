import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useActiveAlerts } from '../../src/lib/useActiveAlerts';
import * as api from '../../src/services/api';
import * as repository from '../../src/db/repository';

jest.mock('../../src/services/api', () => ({
  getActiveAlerts: jest.fn(),
  acknowledgeAlert: jest.fn(),
  isNetworkRequestError: jest.fn((err: unknown) => err instanceof Error && /^Network error requesting/.test(err.message))
}));

jest.mock('../../src/db/repository', () => ({
  getCachedAlerts: jest.fn().mockResolvedValue([]),
  upsertCachedAlerts: jest.fn().mockResolvedValue([]),
  updateCachedAlertAcknowledgement: jest.fn().mockResolvedValue(undefined),
  queueAlertAck: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../src/services/audit', () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../src/lib/AuthContext', () => ({
  useAuth: () => ({ profile: { officerId: 42 } })
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
  locationRadiusMeters: null,
  issuedByName: 'supervisor',
  targetScope: 'all_officers',
  sourceType: 'internal',
  sourceAuthority: null,
  sourceReference: null,
  status: 'active',
  expiresAt: null,
  createdAt: '2026-09-11T10:00:00Z',
  acknowledgedAt: null,
  version: 1
};

describe('useActiveAlerts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (repository.getCachedAlerts as jest.Mock).mockResolvedValue([]);
    (repository.upsertCachedAlerts as jest.Mock).mockResolvedValue([]);
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

  it('caches the fetched alerts on-device for offline reads', async () => {
    (api.getActiveAlerts as jest.Mock).mockResolvedValue([alertFixture]);
    const { result } = renderHook(() => useActiveAlerts());

    await act(async () => {
      await result.current.refresh();
    });

    expect(repository.upsertCachedAlerts).toHaveBeenCalledWith(
      42,
      [{ id: 'alert-1', version: 1, acknowledgedAt: null, payload: alertFixture }]
    );
  });

  it('surfaces an error message when the fetch fails and there is nothing cached', async () => {
    (api.getActiveAlerts as jest.Mock).mockRejectedValue(new Error('Network down'));
    const { result } = renderHook(() => useActiveAlerts());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe('Network down');
    expect(result.current.alerts).toEqual([]);
  });

  it('falls back to the on-device cache when the fetch fails but a prior snapshot exists', async () => {
    (api.getActiveAlerts as jest.Mock).mockRejectedValue(new Error('Network down'));
    (repository.getCachedAlerts as jest.Mock).mockResolvedValue([
      { id: 'alert-1', officerId: 42, version: 1, alertJson: JSON.stringify(alertFixture), receivedAt: '2026-09-11T10:01:00Z', acknowledgedAt: null, updatedAt: '2026-09-11T10:01:00Z' }
    ]);

    const { result } = renderHook(() => useActiveAlerts());
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.alerts).toEqual([alertFixture]);
    expect(result.current.error).toBeNull();
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

  it('acknowledge() queues offline instead of failing when the network is unreachable', async () => {
    (api.getActiveAlerts as jest.Mock).mockResolvedValue([alertFixture]);
    (api.acknowledgeAlert as jest.Mock).mockRejectedValue(new Error('Network error requesting /alerts/alert-1/acknowledge: down'));

    const { result } = renderHook(() => useActiveAlerts());
    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => {
      await result.current.acknowledge('alert-1');
    });

    expect(repository.queueAlertAck).toHaveBeenCalledWith('alert-1', 42, expect.any(String));
    expect(result.current.alerts[0].acknowledgedAt).not.toBeNull();
  });

  it('acknowledge() surfaces a genuine server rejection instead of queuing it', async () => {
    (api.getActiveAlerts as jest.Mock).mockResolvedValue([alertFixture]);
    (api.acknowledgeAlert as jest.Mock).mockRejectedValue(new Error('This alert is not targeted to you'));

    const { result } = renderHook(() => useActiveAlerts());
    await act(async () => {
      await result.current.refresh();
    });

    await expect(result.current.acknowledge('alert-1')).rejects.toThrow('This alert is not targeted to you');
    expect(repository.queueAlertAck).not.toHaveBeenCalled();
  });
});
