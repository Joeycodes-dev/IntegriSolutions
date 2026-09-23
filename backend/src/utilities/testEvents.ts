import type { Env, DurableObjectNamespaceLike } from '../env';

export type TestInsertedEvent = {
  type: 'test-inserted';
  source: 'mobile-sync' | 'web-create';
  count: number;
  at: string;
};

export type CaseUpdatedEvent = {
  type: 'case-updated';
  testId: string;
  caseStatus: string;
  supervisorEmail: string;
  at: string;
};

export type SupervisorEvent = TestInsertedEvent | CaseUpdatedEvent;

const HUB_NAME = 'global';

function getHubStub(env: Env | undefined) {
  const namespace: DurableObjectNamespaceLike | undefined = env?.SSE_HUB;
  if (!namespace) return null;
  const id = namespace.idFromName(HUB_NAME);
  return namespace.get(id);
}

async function broadcast(env: Env | undefined, event: SupervisorEvent): Promise<void> {
  const stub = getHubStub(env);
  if (!stub) return;

  try {
    await stub.fetch('https://sse-hub/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
  } catch (err) {
    console.error('[sse] broadcast failed:', err);
  }
}

export async function publishTestInserted(
  env: Env | undefined,
  source: 'mobile-sync' | 'web-create',
  count: number
): Promise<void> {
  const payload: SupervisorEvent = {
    type: 'test-inserted',
    source,
    count,
    at: new Date().toISOString()
  };
  await broadcast(env, payload);
}

export async function publishCaseUpdated(
  env: Env | undefined,
  testId: string,
  caseStatus: string,
  supervisorEmail: string
): Promise<void> {
  const payload: SupervisorEvent = {
    type: 'case-updated',
    testId,
    caseStatus,
    supervisorEmail,
    at: new Date().toISOString()
  };
  await broadcast(env, payload);
}
