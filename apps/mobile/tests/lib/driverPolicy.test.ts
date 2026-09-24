import { describe, expect, it } from '@jest/globals';

import {
  classifyBacReading,
  resolveDriverPolicy,
} from '../../src/lib/driverPolicy';
import type { RuntimeConfig } from '../../src/types';

const baseConfig: RuntimeConfig = {
  auth: { sessionTimeoutMinutes: 30 },
  export: {
    pdfWatermarkEnabled: true,
    pdfWatermarkText: 'Official',
    pdfAccess: 'admin_supervisor',
  },
  alerts: {
    integrityFlagCount: 2,
    failureRateChangePoints: 3,
    roadblockMinimumTests: 5,
    avgFailingBacMultiple: 2,
  },
  bacLimits: [],
};

describe('classifyBacReading', () => {
  it('uses the general threshold at the exact boundary', () => {
    expect(classifyBacReading('0.049', 0.05)).toBe('PASS');
    expect(classifyBacReading('0.050', 0.05)).toBe('FAIL');
  });

  it('uses the professional threshold at the exact boundary', () => {
    expect(classifyBacReading('0.019', 0.02)).toBe('PASS');
    expect(classifyBacReading('0.020', 0.02)).toBe('FAIL');
    expect(classifyBacReading('0.025', 0.02)).toBe('FAIL');
  });

  it('does not classify empty, malformed, or invalid-policy values', () => {
    expect(classifyBacReading('', 0.05)).toBe('AWAITING');
    expect(classifyBacReading('not-a-number', 0.05)).toBe('AWAITING');
    expect(classifyBacReading('0.08', Number.NaN)).toBe('AWAITING');
  });
});

describe('resolveDriverPolicy', () => {
  it('uses the general default when no licence code or runtime setting exists', () => {
    expect(resolveDriverPolicy(undefined, null)).toEqual({
      key: 'general',
      label: 'General Driver',
      limitG100ml: 0.05,
      limitMg1000ml: 0.5,
    });
  });

  it('keeps the professional offline fallback when that runtime entry is missing', () => {
    expect(resolveDriverPolicy('P', baseConfig)).toEqual({
      key: 'professional',
      label: 'Professional Driver',
      limitG100ml: 0.02,
      limitMg1000ml: 0.2,
    });
  });

  it('uses configured limits and labels for the selected category', () => {
    const config: RuntimeConfig = {
      ...baseConfig,
      bacLimits: [
        {
          key: 'professional',
          label: 'PrDP Professional',
          limitG100ml: 0.03,
          limitMg1000ml: 0.3,
        },
      ],
    };

    expect(resolveDriverPolicy('C1', config)).toEqual({
      key: 'professional',
      label: 'PrDP Professional',
      limitG100ml: 0.03,
      limitMg1000ml: 0.3,
    });
  });

  it('rejects invalid runtime limits and derives the equivalent mg/L value', () => {
    const config: RuntimeConfig = {
      ...baseConfig,
      bacLimits: [
        {
          key: 'general',
          label: 'Invalid general policy',
          limitG100ml: Number.NaN,
          limitMg1000ml: -1,
        },
      ],
    };

    expect(resolveDriverPolicy('B', config)).toEqual({
      key: 'general',
      label: 'General Driver',
      limitG100ml: 0.05,
      limitMg1000ml: 0.5,
    });
  });
});
