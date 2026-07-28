import { useEffect, useMemo, useState } from 'react';
import { getTests } from '../services/api';
import type { TestRecord } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function useSupervisorTests() {
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadTests = async () => {
      try {
        const data = await getTests();
        if (!cancelled) {
          setTests(data as TestRecord[]);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load test data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadTests();
    const interval = setInterval(() => void loadTests(), 10000);

    const stream = typeof EventSource !== 'undefined'
      ? new EventSource(`${API_BASE}/api/tests/stream`)
      : null;
    if (stream) {
      stream.onopen = () => {
        if (!cancelled) {
          setStreamConnected(true);
        }
      };
      stream.onmessage = (event) => {
        if (!cancelled) {
          setStreamConnected(true);
          try {
            const payload = JSON.parse(event.data) as { at?: string; type?: string };
            if (payload.type === 'test-inserted' && payload.at) {
              setLastEventAt(payload.at);
            }
          } catch {
            // keep silent if heartbeat or non-JSON payload is received
          }
        }
        void loadTests();
      };
      stream.onerror = () => {
        if (!cancelled) {
          setStreamConnected(false);
        }
        // keep polling fallback active when EventSource is unavailable
      };
    }

    return () => {
      cancelled = true;
      clearInterval(interval);
      stream?.close();
    };
  }, []);

  const todayTests = useMemo(() => tests.filter((t) => isToday(t.createdAt)), [tests]);

  const metrics = useMemo(() => {
    const source = tests;
    const totalTests = source.length;
    const totalFailures = source.filter((t) => t.result === 'fail').length;
    const activeOfficers = new Set(
      source.map((t) => t.officerId).filter((id): id is number => id != null)
    ).size;
    const invalidTests = source.filter(
      (t) => !t.location?.trim() || !t.hash?.trim() || !t.driverId?.trim()
    ).length;

    return { totalTests, totalFailures, activeOfficers, invalidTests };
  }, [tests, todayTests]);

  return { tests, todayTests, loading, error, metrics, streamConnected, lastEventAt };
}
