import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { AlertsProvider, useAlertsContext } from '../../src/lib/AlertsContext';
import { summarizeAlertsForHome } from '../../src/lib/homeAlertsSummary';
import * as api from '../../src/services/api';

const mockAuthState = { token: 'token-123' as string | null };

jest.mock('../../src/lib/AuthContext', () => ({
  useAuth: () => mockAuthState
}));

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

function alertFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
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
    acknowledgedAt: null,
    ...overrides
  };
}

describe('AlertsContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.token = 'token-123';
  });

  it('throws when useAlertsContext is used outside an AlertsProvider', () => {
    expect(() => {
      renderHook(() => useAlertsContext());
    }).toThrow('useAlertsContext must be used within an AlertsProvider');
  });

  it('fetches active alerts once on mount via the existing alerts hook (no duplicated fetch)', async () => {
    (api.getActiveAlerts as jest.Mock).mockResolvedValue([alertFixture()]);

    const { result } = renderHook(() => useAlertsContext(), { wrapper: AlertsProvider });

    await waitFor(() => {
      expect(result.current.alerts).toHaveLength(1);
    });

    expect(api.getActiveAlerts).toHaveBeenCalledTimes(1);
  });

  it('does not fetch before an access token is available', async () => {
    mockAuthState.token = null;
    (api.getActiveAlerts as jest.Mock).mockResolvedValue([alertFixture()]);

    renderHook(() => useAlertsContext(), { wrapper: AlertsProvider });

    // Give any stray async work a chance to run.
    await act(async () => {
      await Promise.resolve();
    });

    expect(api.getActiveAlerts).not.toHaveBeenCalled();
  });

  it('shares one fetched alert list across every consumer of the context', async () => {
    (api.getActiveAlerts as jest.Mock).mockResolvedValue([alertFixture({ id: 'alert-a' }), alertFixture({ id: 'alert-b' })]);

    const first = renderHook(() => useAlertsContext(), { wrapper: AlertsProvider });
    const second = renderHook(() => useAlertsContext(), { wrapper: AlertsProvider });

    await waitFor(() => {
      expect(first.result.current.alerts).toHaveLength(2);
      expect(second.result.current.alerts).toHaveLength(2);
    });
  });

  it('acknowledging an alert decreases the unacknowledged count used for the bottom-nav badge', async () => {
    (api.getActiveAlerts as jest.Mock).mockResolvedValue([
      alertFixture({ id: 'alert-a', priority: 'high' }),
      alertFixture({ id: 'alert-b', priority: 'medium' })
    ]);
    (api.acknowledgeAlert as jest.Mock).mockResolvedValue({ alertId: 'alert-a', acknowledgedAt: '2026-09-12T10:00:00Z' });

    const { result } = renderHook(() => useAlertsContext(), { wrapper: AlertsProvider });

    await waitFor(() => {
      expect(result.current.alerts).toHaveLength(2);
    });
    expect(summarizeAlertsForHome(result.current.alerts).totalUnacknowledged).toBe(2);

    await act(async () => {
      await result.current.acknowledge('alert-a');
    });

    await waitFor(() => {
      expect(summarizeAlertsForHome(result.current.alerts).totalUnacknowledged).toBe(1);
    });
  });

  it('never opens a blocking Alert dialog while refreshing or acknowledging (no capture-flow interruption)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    (api.getActiveAlerts as jest.Mock).mockResolvedValue([alertFixture()]);
    (api.acknowledgeAlert as jest.Mock).mockResolvedValue({ alertId: 'alert-1', acknowledgedAt: '2026-09-12T10:00:00Z' });

    const { result } = renderHook(() => useAlertsContext(), { wrapper: AlertsProvider });

    await waitFor(() => {
      expect(result.current.alerts).toHaveLength(1);
    });

    await act(async () => {
      await result.current.acknowledge('alert-1');
    });

    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('never opens a blocking Alert dialog for a Critical-priority alert either — priority controls prominence, never interruption', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    (api.getActiveAlerts as jest.Mock).mockResolvedValue([alertFixture({ id: 'alert-critical', priority: 'critical' })]);
    (api.acknowledgeAlert as jest.Mock).mockResolvedValue({ alertId: 'alert-critical', acknowledgedAt: '2026-09-12T10:00:00Z' });

    const { result } = renderHook(() => useAlertsContext(), { wrapper: AlertsProvider });

    await waitFor(() => {
      expect(result.current.alerts).toHaveLength(1);
      expect(result.current.alerts[0].priority).toBe('critical');
    });

    await act(async () => {
      await result.current.acknowledge('alert-critical');
    });

    // A Critical alert only ever updates state (badge/banner data) here —
    // it never triggers a modal or navigation itself. Whether it's safe to
    // show prominently is the caller screen's responsibility (only render
    // the banner outside an active capture step).
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('surfaces a fetch failure as state, never as a thrown/blocking error', async () => {
    (api.getActiveAlerts as jest.Mock).mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useAlertsContext(), { wrapper: AlertsProvider });

    await waitFor(() => {
      expect(result.current.error).toBe('Network down');
    });
    expect(result.current.alerts).toEqual([]);
  });
});
