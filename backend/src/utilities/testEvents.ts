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

type Listener = (payload: SupervisorEvent) => void;

const listeners = new Set<Listener>();

export function publishTestInserted(source: 'mobile-sync' | 'web-create', count: number): void {
  const payload: SupervisorEvent = { type: 'test-inserted', source, count, at: new Date().toISOString() };
  for (const listener of listeners) {
    listener(payload);
  }
}

export function publishCaseUpdated(testId: string, caseStatus: string, supervisorEmail: string): void {
  const payload: SupervisorEvent = {
    type: 'case-updated',
    testId,
    caseStatus,
    supervisorEmail,
    at: new Date().toISOString(),
  };
  for (const listener of listeners) {
    listener(payload);
  }
}

export function subscribeTestInserted(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Alias for generic supervisor events (test-inserted + case-updated)
export const subscribeSupervisorEvents = subscribeTestInserted;
