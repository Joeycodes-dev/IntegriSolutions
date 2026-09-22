import type { Env, DurableObjectNamespaceLike } from '../env';

type Writer = {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): void;
};

const HUB_NAME = 'global';
const HEARTBEAT_MS = 25000;

const encoder = new TextEncoder();

export class SseHub {
  private readonly state: unknown;
  private readonly env: Env;
  private readonly connections = new Set<Writer>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(state: unknown, env: Env) {
    this.state = state;
    this.env = env;
    void this.state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/broadcast') {
      let event: unknown;
      try {
        event = await request.json();
      } catch {
        return new Response('Invalid JSON', { status: 400 });
      }
      this.broadcast(event);
      return new Response(null, { status: 204 });
    }

    if (request.method === 'GET') {
      return this.openStream(request);
    }

    return new Response('Not found', { status: 404 });
  }

  private openStream(request: Request): Response {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    this.connections.add(writer);
    this.ensureHeartbeat();

    const connected = { type: 'connected', at: new Date().toISOString() };
    void writer.write(encoder.encode(`data: ${JSON.stringify(connected)}\n\n`));

    const cleanup = () => {
      this.connections.delete(writer);
      if (this.connections.size === 0) {
        this.stopHeartbeat();
      }
      writer.close().catch(() => {
        try {
          writer.abort();
        } catch {
          // already closed
        }
      });
    };

    if (request.signal) {
      if (request.signal.aborted) {
        cleanup();
      } else {
        request.signal.addEventListener('abort', cleanup, { once: true });
      }
    }

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      }
    });
  }

  private broadcast(event: unknown): void {
    const chunk = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
    for (const writer of this.connections) {
      writer.write(chunk).catch(() => {
        this.connections.delete(writer);
        if (this.connections.size === 0) {
          this.stopHeartbeat();
        }
      });
    }
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const chunk = encoder.encode(': keepalive\n\n');
      for (const writer of this.connections) {
        writer.write(chunk).catch(() => {
          this.connections.delete(writer);
        });
      }
      if (this.connections.size === 0) {
        this.stopHeartbeat();
      }
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export function hubName(): string {
  return HUB_NAME;
}

export type { DurableObjectNamespaceLike };
