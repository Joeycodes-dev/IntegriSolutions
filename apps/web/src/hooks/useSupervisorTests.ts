import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTests } from '../services/api';
import type { TestRecord } from '../types';
import { useSseWithFallback, type SupervisorEvent } from './useSseWithFallback';

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function hasTestLocation(location: TestRecord['location']): boolean {
  if (location == null) return false;
  if (typeof location === 'string') return location.trim().length > 0;
  return Object.keys(location).length > 0;
}

export function useSupervisorTests() {
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);

  const loadTests = useCallback(async () => {
    try {
      const data = await getTests();
      setTests(data as TestRecord[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load test data');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMessage = useCallback(
    (event: SupervisorEvent) => {
      if (event.type === 'test-inserted' && typeof event.at === 'string') {
        setLastEventAt(event.at as string);
      }
      // Test list is affected by test-inserted; case-updated does not require test reload
      if (event.type === 'test-inserted') {
        void loadTests();
      }
    },
    [loadTests]
  );

  const { streamConnected } = useSseWithFallback({
    onMessage: handleMessage,
    fallback: loadTests,
    fallbackIntervalMs: 60_000,
    periodicIntervalMs: 90_000,
  });

  useEffect(() => {
    void loadTests();
  }, [loadTests]);

  const todayTests = useMemo(() => tests.filter((t) => isToday(t.createdAt)), [tests]);

  const metrics = useMemo(() => {
    const source = tests;
    const totalTests = source.length;
    const totalFailures = source.filter((t) => t.result === 'fail').length;
    const activeOfficers = new Set(
      source.map((t) => t.officerId).filter((id): id is number => id != null)
    ).size;
    const invalidTests = source.filter(
      (t) => !hasTestLocation(t.location) || !t.hash?.trim() || !t.driverId?.trim()
    ).length;

    return { totalTests, totalFailures, activeOfficers, invalidTests };
  }, [tests, todayTests]);

  return { tests, todayTests, loading, error, metrics, streamConnected, lastEventAt };
}
