import { useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../services/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export type SupervisorEvent = {
  type: 'test-inserted' | 'case-updated' | 'connected' | string;
  at?: string;
  source?: string;
  count?: number;
  testId?: string;
  caseStatus?: string;
  [key: string]: unknown;
};

// --- Global singleton SSE manager ---
let globalStream: EventSource | null = null;
let globalConnected = false;
let retryAttempt = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

const eventListeners = new Set<(event: SupervisorEvent) => void>();
const connectionListeners = new Set<(connected: boolean) => void>();
let visibilityHandlerAttached = false;

function notifyConnection(connected: boolean) {
  if (globalConnected === connected) return;
  globalConnected = connected;
  for (const listener of connectionListeners) {
    try {
      listener(connected);
    } catch {
      // ignore
    }
  }
}

function clearReconnectTimeout() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

function scheduleReconnect() {
  clearReconnectTimeout();
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, retryAttempt), RECONNECT_MAX_MS);
  const jitter = Math.random() * 0.2 * delay;
  retryAttempt += 1;
  reconnectTimeout = setTimeout(() => {
    connect();
  }, delay + jitter);
}

function connect() {
  if (globalStream) {
    try {
      globalStream.close();
    } catch {
      // ignore
    }
    globalStream = null;
  }

  const token = getAccessToken();
  if (!token || typeof EventSource === 'undefined') {
    notifyConnection(false);
    scheduleReconnect();
    return;
  }

  const streamUrl = `${API_BASE}/api/tests/stream?access_token=${encodeURIComponent(token)}`;
  const es = new EventSource(streamUrl);
  globalStream = es;

  es.onopen = () => {
    retryAttempt = 0;
    clearReconnectTimeout();
    notifyConnection(true);
  };

  es.onmessage = (event) => {
    retryAttempt = 0;
    clearReconnectTimeout();
    // ensure connected state is true if we were previously disconnected
    if (!globalConnected) notifyConnection(true);
    let parsed: SupervisorEvent | null = null;
    try {
      parsed = JSON.parse(event.data) as SupervisorEvent;
    } catch {
      // heartbeat or non-JSON, treat as generic
      parsed = { type: 'message', at: new Date().toISOString() } as SupervisorEvent;
    }
    if (parsed) {
      for (const listener of eventListeners) {
        try {
          listener(parsed);
        } catch {
          // ignore
        }
      }
    }
  };

  es.onerror = () => {
    try {
      es.close();
    } catch {
      // ignore
    }
    if (globalStream === es) globalStream = null;
    notifyConnection(false);
    scheduleReconnect();
  };
}

function ensureConnected() {
  if (!globalStream && eventListeners.size > 0) {
    connect();
  }
}

function cleanupIfNoListeners() {
  if (eventListeners.size === 0) {
    if (globalStream) {
      try {
        globalStream.close();
      } catch {
        // ignore
      }
      globalStream = null;
    }
    clearReconnectTimeout();
    // keep globalConnected false
    if (globalConnected) notifyConnection(false);
    retryAttempt = 0;
    if (visibilityHandlerAttached) {
      document.removeEventListener('visibilitychange', handleVisibility);
      visibilityHandlerAttached = false;
    }
  }
}

function handleVisibility() {
  if (document.visibilityState === 'visible') {
    // trigger immediate reconnect if disconnected
    if (!globalStream || (globalStream.readyState as number) === 2) {
      retryAttempt = 0;
      clearReconnectTimeout();
      connect();
    }
    // notify all connection listeners to trigger periodic refresh handlers if needed
    // Do not change connection state, just ensure connectivity
  }
}

function ensureVisibilityHandler() {
  if (!visibilityHandlerAttached && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
    visibilityHandlerAttached = true;
  }
}

// For testing: reset global state
export function __resetSseForTests() {
  if (globalStream) {
    try {
      globalStream.close();
    } catch {
      // ignore
    }
    globalStream = null;
  }
  eventListeners.clear();
  connectionListeners.clear();
  clearReconnectTimeout();
  globalConnected = false;
  retryAttempt = 0;
  if (visibilityHandlerAttached && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibility);
    visibilityHandlerAttached = false;
  }
}

export interface UseSseWithFallbackOptions {
  onMessage: (event: SupervisorEvent) => void;
  fallback?: () => void;
  fallbackIntervalMs?: number;
  periodicIntervalMs?: number;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export function useSseWithFallback(options: UseSseWithFallbackOptions) {
  const {
    onMessage,
    fallback,
    fallbackIntervalMs = 60_000,
    periodicIntervalMs = 0,
    onConnected,
    onDisconnected,
  } = options;

  const onMessageRef = useRef(onMessage);
  const fallbackRef = useRef(fallback);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    fallbackRef.current = fallback;
  }, [fallback]);
  useEffect(() => {
    onConnectedRef.current = onConnected;
  }, [onConnected]);
  useEffect(() => {
    onDisconnectedRef.current = onDisconnected;
  }, [onDisconnected]);

  const [streamConnected, setStreamConnected] = useState(globalConnected);

  useEffect(() => {
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let periodicInterval: ReturnType<typeof setInterval> | null = null;

    const stopFallback = () => {
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
      }
    };
    const startFallback = () => {
      if (fallbackInterval || !fallbackRef.current) return;
      fallbackInterval = setInterval(() => {
        fallbackRef.current?.();
      }, fallbackIntervalMs);
    };

    const stopPeriodic = () => {
      if (periodicInterval) {
        clearInterval(periodicInterval);
        periodicInterval = null;
      }
    };
    const startPeriodic = () => {
      if (periodicInterval || !fallbackRef.current || periodicIntervalMs <= 0) return;
      periodicInterval = setInterval(() => {
        fallbackRef.current?.();
      }, periodicIntervalMs);
    };

    const eventListener = (event: SupervisorEvent) => {
      onMessageRef.current(event);
    };

    const connectionListener = (connected: boolean) => {
      setStreamConnected(connected);
      if (connected) {
        stopFallback();
        startPeriodic();
        onConnectedRef.current?.();
      } else {
        stopPeriodic();
        startFallback();
        onDisconnectedRef.current?.();
      }
    };

    eventListeners.add(eventListener);
    connectionListeners.add(connectionListener);
    ensureVisibilityHandler();
    // sync initial state
    setStreamConnected(globalConnected);
    if (globalConnected) {
      stopFallback();
      startPeriodic();
    } else {
      startFallback();
    }
    ensureConnected();

    // Handle visibility for fallback trigger at subscriber level as well
    const handleVisibilitySub = () => {
      if (document.visibilityState === 'visible') {
        fallbackRef.current?.();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilitySub);

    return () => {
      eventListeners.delete(eventListener);
      connectionListeners.delete(connectionListener);
      document.removeEventListener('visibilitychange', handleVisibilitySub);
      stopFallback();
      stopPeriodic();
      cleanupIfNoListeners();
    };
    // fallbackIntervalMs and periodicIntervalMs are stable (constants); if they change, effect will restart
  }, [fallbackIntervalMs, periodicIntervalMs]);

  return { streamConnected };
}
