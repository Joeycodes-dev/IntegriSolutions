import { useCallback, useState } from 'react';
import { getActiveAlerts, acknowledgeAlert, isNetworkRequestError } from '../services/api';
import { getCachedAlerts, upsertCachedAlerts, updateCachedAlertAcknowledgement, queueAlertAck } from '../db/repository';
import { logAuditEvent } from '../services/audit';
import { useAuth } from './AuthContext';
import { syncCoordinator } from './SyncCoordinator';
import type { OperationalAlert } from '../types';

/**
 * Thin wrapper around the existing GET /alerts/active + acknowledge API
 * (services/api.ts) — no new alert-fetching logic, just shared React state
 * so screens (currently OfficerDashboardScreen's Home) don't each reimplement
 * fetch/refresh/acknowledge bookkeeping. Callers are responsible for calling
 * refresh() when they want fresh data (e.g. from their own useFocusEffect),
 * matching how SyncContext's refreshCounts() is already used in this app.
 *
 * Offline behavior: refresh() falls back to the on-device alert_cache (see
 * db/repository.ts) when the network fetch fails, so Home/Alerts keep
 * working after a cold start with no connectivity. acknowledge() queues an
 * offline tap into alert_ack_queue instead of failing outright; SyncContext's
 * existing sync heartbeat drains that queue on reconnect (see services/sync.ts).
 */
export function useActiveAlerts() {
  const { profile } = useAuth();
  const officerId = profile?.officerId ?? null;
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const active = await getActiveAlerts();
      setAlerts(active);
      setError(null);

      const receipts = await upsertCachedAlerts(
        officerId,
        active.map((alert) => ({ id: alert.id, version: alert.version, acknowledgedAt: alert.acknowledgedAt, payload: alert }))
      );
      for (const receipt of receipts) {
        if (!receipt.isNewReceipt) continue;
        const alert = active.find((item) => item.id === receipt.id);
        if (!alert) continue;
        await logAuditEvent({
          action: 'alert.received',
          outcome: 'success',
          message: `Alert ${alert.id} (v${alert.version}) received on device`,
          entityType: 'alert',
          entityId: alert.id,
          officerId,
          metadata: { alertVersion: alert.version, createdAt: alert.createdAt, receivedAt: receipt.receivedAt }
        });
      }
    } catch (err) {
      const fallbackMessage = err instanceof Error ? err.message : 'Failed to load operational alerts';
      try {
        const cached = await getCachedAlerts(officerId);
        if (cached.length > 0) {
          // Something to show from a prior fetch — use it and stay quiet
          // about the failed refresh rather than blocking Home/Alerts.
          setAlerts(cached.map((row) => JSON.parse(row.alertJson) as OperationalAlert));
          setError(null);
        } else {
          setAlerts([]);
          setError(fallbackMessage);
        }
      } catch {
        setError(fallbackMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [officerId]);

  const acknowledge = useCallback(async (alertId: string) => {
    try {
      const result = await syncCoordinator.run(() => acknowledgeAlert(alertId));
      setAlerts((prev) =>
        prev.map((item) => (item.id === alertId ? { ...item, acknowledgedAt: result.acknowledgedAt } : item))
      );
      await updateCachedAlertAcknowledgement(alertId, result.acknowledgedAt);
      return result;
    } catch (err) {
      if (!isNetworkRequestError(err)) throw err;

      const acknowledgedAt = new Date().toISOString();
      await queueAlertAck(alertId, officerId, acknowledgedAt);
      await updateCachedAlertAcknowledgement(alertId, acknowledgedAt);
      setAlerts((prev) => prev.map((item) => (item.id === alertId ? { ...item, acknowledgedAt } : item)));
      await logAuditEvent({
        action: 'alert.acknowledged.queued',
        outcome: 'success',
        message: `Acknowledgement queued offline for alert ${alertId}`,
        entityType: 'alert',
        entityId: alertId,
        officerId
      });
      return { alertId, acknowledgedAt };
    }
  }, [officerId]);

  return { alerts, loading, error, refresh, acknowledge };
}
