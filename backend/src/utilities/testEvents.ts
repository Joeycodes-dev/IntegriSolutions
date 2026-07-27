type Listener = (payload: { source: 'mobile-sync' | 'web-create'; count: number; at: string }) => void;

const listeners = new Set<Listener>();

export function publishTestInserted(source: 'mobile-sync' | 'web-create', count: number): void {
  const payload = { source, count, at: new Date().toISOString() };
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
