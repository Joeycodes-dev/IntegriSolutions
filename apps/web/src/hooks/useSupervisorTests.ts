import { useEffect, useMemo, useState } from 'react';
import { getTests } from '../services/api';
import type { TestRecord } from '../types';

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

    return () => {
      cancelled = true;
      clearInterval(interval);
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

  return { tests, todayTests, loading, error, metrics };
}
