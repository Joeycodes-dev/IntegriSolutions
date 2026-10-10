import {
  getPendingSessionInterruptions,
  hasAppClosedInterruption,
  insertSessionInterruption,
  markSessionInterruptionFailed,
  markSessionInterruptionSynced,
  type SessionInterruptionKind
} from '../db/repository';
import { getAccessToken } from '../services/auth';
import { API_BASE_URL } from '../services/constants';
import { logAuditEvent } from '../services/audit';
import { generateId } from './id';

export type { SessionInterruptionKind };

type InterruptionProfile = {
  officerId?: number | null;
  name: string;
  surname: string;
  badgeNumber: string;
} | null;

/**
 * Records that an officer abandoned an in-progress test session (licence scan
 * / BAC reading) without saving. Always written to the local outbox first so
 * it survives offline periods and app kills, then pushed to the backend on a
 * best-effort basis (flushSessionInterruptions retries the rest).
 */
export async function recordSessionInterruption(params: {
  draftId: string;
  plannedTestId?: string | null;
  step: 'scan' | 'reading';
  kind: SessionInterruptionKind;
  reason?: string | null;
  profile: InterruptionProfile;
}): Promise<void> {
  const reason = params.reason?.trim() || null;

  // One app_closed row per draft: backgrounding is noisy and the supervisor
  // only needs to know the session was left by closing the app, not how often.
  if (params.kind === 'app_closed' && (await hasAppClosedInterruption(params.draftId))) {
    return;
  }

  const record = {
    id: generateId(),
    draftId: params.draftId,
    plannedTestId: params.plannedTestId ?? null,
    step: params.step,
    kind: params.kind,
    reason,
    officerId: params.profile?.officerId ?? null,
    occurredAt: new Date().toISOString()
  };

  await insertSessionInterruption(record);

  await logAuditEvent({
    action: 'test.session.interrupted',
    outcome: 'success',
    severity: 'warning',
    message:
      params.kind === 'app_closed'
        ? 'App was closed during an unfinished test session'
        : `Test session ${params.kind === 'cancelled' ? 'cancelled' : 'left'}: ${reason ?? 'no reason captured'}`,
    entityType: 'test_draft',
    entityId: params.draftId,
    officerId: params.profile?.officerId ?? null,
    officerName: params.profile ? `${params.profile.name} ${params.profile.surname}`.trim() : null,
    badgeNumber: params.profile?.badgeNumber ?? null,
    metadata: { kind: params.kind, step: params.step, reason }
  });

  // Best effort: push immediately; whatever fails stays pending for the flush.
  await flushSessionInterruptions().catch(() => undefined);
}

/** Uploads every locally queued interruption whose last attempt has not
 * succeeded yet. Safe to call often — failures stay pending. */
export async function flushSessionInterruptions(): Promise<void> {
  const pending = await getPendingSessionInterruptions();
  if (pending.length === 0) return;

  const token = await getAccessToken();
  if (!token) return;

  for (const item of pending) {
    try {
      const response = await fetch(`${API_BASE_URL}/officers/session-interruptions`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          id: item.id,
          draftId: item.draftId,
          plannedTestId: item.plannedTestId,
          step: item.step,
          kind: item.kind,
          reason: item.reason,
          occurredAt: item.occurredAt
        })
      });

      if (response.ok) {
        await markSessionInterruptionSynced(item.id);
      } else {
        await markSessionInterruptionFailed(item.id, `HTTP ${response.status}`);
      }
    } catch (error) {
      // Offline or server down — stop hammering and leave the rest pending.
      await markSessionInterruptionFailed(
        item.id,
        error instanceof Error ? error.message : 'Network error'
      );
      break;
    }
  }
}
