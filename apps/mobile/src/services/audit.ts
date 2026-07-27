import {
  insertAuditEvent,
  getAllAuditEvents,
  getAuditEventsByAction,
  getAuditEventCounts,
  type AuditAction,
  type AuditEvent,
  type AuditOutcome,
  type AuditSeverity
} from '../db/repository';
import { generateId } from '../lib/id';

export interface LogAuditParams {
  action: AuditAction;
  outcome: AuditOutcome;
  severity?: AuditSeverity;
  message: string;
  entityType?: string;
  entityId?: string;
  officerId?: number | null;
  officerName?: string | null;
  badgeNumber?: string | null;
  metadata?: Record<string, unknown>;
}

const DEFAULT_SEVERITY: Record<AuditOutcome, AuditSeverity> = {
  success: 'info',
  failure: 'warning'
};

export async function logAuditEvent(params: LogAuditParams): Promise<void> {
  try {
    const severity = params.severity ?? DEFAULT_SEVERITY[params.outcome];
    const event: AuditEvent = {
      id: generateId(),
      occurredAt: new Date().toISOString(),
      officerId: params.officerId ?? null,
      officerName: params.officerName ?? null,
      badgeNumber: params.badgeNumber ?? null,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      outcome: params.outcome,
      severity,
      message: params.message,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null
    };
    await insertAuditEvent(event);
  } catch (error) {
    if (__DEV__) {
      console.warn('[audit] failed to record event', params.action, error);
    }
  }
}

export async function loadAuditEvents(
  filter: 'all' | 'auth' | 'test' | 'sync' = 'all',
  limit = 500
): Promise<AuditEvent[]> {
  if (filter === 'all') {
    return getAllAuditEvents(limit);
  }
  return getAuditEventsByAction(filter, limit);
}

export function loadAuditEventCounts() {
  return getAuditEventCounts();
}
