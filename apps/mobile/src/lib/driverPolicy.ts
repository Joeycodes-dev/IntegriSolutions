import type { BacCategoryKey, RuntimeConfig } from '../types';
import { deriveDriverCategory } from './testLocation';

export type ResolvedDriverPolicy = {
  key: BacCategoryKey;
  label: string;
  limitG100ml: number;
  limitMg1000ml: number;
};

const DEFAULT_POLICIES: Record<
  BacCategoryKey,
  Omit<ResolvedDriverPolicy, 'key'>
> = {
  general: {
    label: 'General Driver',
    limitG100ml: 0.05,
    limitMg1000ml: 0.5,
  },
  professional: {
    label: 'Professional Driver',
    limitG100ml: 0.02,
    limitMg1000ml: 0.2,
  },
};

function isValidLimit(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Resolve the one policy used for BAC presentation, classification, persistence,
 * and evidence metadata. Category-specific defaults remain available when the
 * runtime configuration is offline or missing an entry.
 */
export type BacClassification = 'AWAITING' | 'PASS' | 'FAIL';

export function classifyBacReading(
  value: string,
  limitG100ml: number,
): BacClassification {
  if (!value.trim() || !Number.isFinite(limitG100ml) || limitG100ml < 0) {
    return 'AWAITING';
  }
  const reading = Number.parseFloat(value);
  if (!Number.isFinite(reading)) return 'AWAITING';
  return reading >= limitG100ml ? 'FAIL' : 'PASS';
}

export function resolveDriverPolicy(
  licenseCodes: string | undefined,
  runtimeConfig: RuntimeConfig | null,
): ResolvedDriverPolicy {
  const key = deriveDriverCategory(licenseCodes);
  const fallback = DEFAULT_POLICIES[key];
  const configured = runtimeConfig?.bacLimits.find((entry) => entry.key === key);
  const hasConfiguredLimit = isValidLimit(configured?.limitG100ml);
  const limitG100ml = hasConfiguredLimit
    ? configured.limitG100ml
    : fallback.limitG100ml;
  const limitMg1000ml = isValidLimit(configured?.limitMg1000ml)
    ? configured.limitMg1000ml
    : limitG100ml * 10;

  return {
    key,
    label: hasConfiguredLimit
      ? configured?.label?.trim() || fallback.label
      : fallback.label,
    limitG100ml,
    limitMg1000ml,
  };
}
