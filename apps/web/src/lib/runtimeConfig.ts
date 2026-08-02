import { useEffect, useState } from 'react';
import { getRuntimeConfig } from '../services/api';
import type { RuntimeConfig } from '../types';

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  auth: { sessionTimeoutMinutes: 30 },
  export: {
    pdfWatermarkEnabled: true,
    pdfWatermarkText: 'IntegriScan Court Evidence',
    pdfAccess: 'admin_supervisor'
  },
  alerts: {
    integrityFlagCount: 1,
    failureRateChangePoints: 1,
    roadblockMinimumTests: 3,
    avgFailingBacMultiple: 2
  },
  bacLimits: [
    { key: 'general', label: 'General Driver', limitG100ml: 0.05, limitMg1000ml: 0.24 },
    { key: 'professional', label: 'Professional Driver', limitG100ml: 0.02, limitMg1000ml: 0.10 }
  ]
};

/** Loads role-safe runtime settings once; falls back to defaults offline. */
export function useRuntimeConfig(): RuntimeConfig | null {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);

  useEffect(() => {
    let alive = true;
    getRuntimeConfig()
      .then((data) => {
        if (alive) setConfig(data);
      })
      .catch(() => {
        if (alive) setConfig(DEFAULT_RUNTIME_CONFIG);
      });
    return () => {
      alive = false;
    };
  }, []);

  return config;
}
