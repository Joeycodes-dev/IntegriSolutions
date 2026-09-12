import { useCallback, useState } from 'react';
import { getActiveAlerts, acknowledgeAlert } from '../services/api';
import type { OperationalAlert } from '../types';

/**
 * Thin wrapper around the existing GET /alerts/active + acknowledge API
 * (services/api.ts) — no new alert-fetching logic, just shared React state
 * so screens (currently OfficerDashboardScreen's Home) don't each reimplement
 * fetch/refresh/acknowledge bookkeeping. Callers are responsible for calling
 * refresh() when they want fresh data (e.g. from their own useFocusEffect),
 * matching how SyncContext's refreshCounts() is already used in this app.
 */
export function useActiveAlerts() {
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const active = await getActiveAlerts();
      setAlerts(active);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operational alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  const acknowledge = useCallback(async (alertId: string) => {
    const result = await acknowledgeAlert(alertId);
    setAlerts((prev) =>
      prev.map((item) => (item.id === alertId ? { ...item, acknowledgedAt: result.acknowledgedAt } : item))
    );
    return result;
  }, []);

  return { alerts, loading, error, refresh, acknowledge };
}
