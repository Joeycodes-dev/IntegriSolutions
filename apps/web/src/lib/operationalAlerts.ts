import type { OperationalAlert, OperationalAlertStatus } from '../types';

/**
 * An alert whose expires_at has passed but whose stored status is still
 * 'active' is treated as effectively expired everywhere it's displayed or
 * counted. This never mutates the DB — there is no background-job pattern in
 * this codebase to auto-transition status, so the row stays 'active' until a
 * supervisor explicitly resolves/cancels it (or a future scheduled job is
 * added). Single source of truth for this rule — see SupervisorAlerts.tsx
 * (display) and SupervisorOverview.tsx (Dashboard KPIs), both of which
 * delegate here rather than each re-deriving it.
 */
export function effectiveAlertStatus(alert: OperationalAlert): OperationalAlertStatus {
  if (alert.status === 'active' && alert.expiresAt) {
    const expiresAtMs = new Date(alert.expiresAt).getTime();
    if (!Number.isNaN(expiresAtMs) && expiresAtMs <= Date.now()) {
      return 'expired';
    }
  }
  return alert.status;
}

/** True only when the alert is active right now — stored status 'active'
 * AND its expiry (if any) has not passed. */
export function isAlertEffectivelyActive(alert: OperationalAlert): boolean {
  return effectiveAlertStatus(alert) === 'active';
}
