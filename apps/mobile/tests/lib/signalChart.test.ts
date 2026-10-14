import {
  ADC_FULL_SCALE,
  SIGNAL_MIN_SPAN,
  SIGNAL_RISING_MARGIN,
  SIGNAL_TREND_LOOKBACK,
  SIGNAL_TREND_THRESHOLD,
  SIGNAL_WINDOW_SAMPLES,
  appendSignalSample,
  barHeight,
  classifySignalSample,
  computeSignalScale,
  describeSignal,
  signalTrend,
  signalWindowSeconds,
  type SignalSample
} from '../../src/lib/signalChart';

function sample(value: number, over = false, at = 0): SignalSample {
  return { value, over, at };
}

function series(values: number[]): SignalSample[] {
  return values.map((value) => sample(value));
}

describe('signalChart constants', () => {
  it('keeps the documented ADC window and thresholds', () => {
    expect(ADC_FULL_SCALE).toBe(1023);
    expect(SIGNAL_WINDOW_SAMPLES).toBe(60);
    expect(SIGNAL_MIN_SPAN).toBe(40);
    expect(SIGNAL_RISING_MARGIN).toBe(6);
    expect(SIGNAL_TREND_LOOKBACK).toBe(3);
    expect(SIGNAL_TREND_THRESHOLD).toBe(3);
  });
});

describe('appendSignalSample', () => {
  it('keeps the newest samples once the window is full', () => {
    const existing = series(Array.from({ length: 65 }, (_, index) => index));
    const next = appendSignalSample(existing, sample(999));

    expect(next).toHaveLength(SIGNAL_WINDOW_SAMPLES);
    expect(next[next.length - 1].value).toBe(999);
    expect(next[0].value).toBe(6);
  });

  it('respects a custom limit', () => {
    const next = appendSignalSample(series([1, 2, 3]), sample(4), 2);
    expect(next.map((item) => item.value)).toEqual([3, 4]);
  });

  it('never mutates the input array', () => {
    const existing = series([1, 2, 3]);
    const snapshot = [...existing];
    const next = appendSignalSample(existing, sample(4));

    expect(existing).toEqual(snapshot);
    expect(existing).toHaveLength(3);
    expect(next).not.toBe(existing);
  });

  it('ignores a non-finite reading', () => {
    const existing = series([1, 2, 3]);
    const next = appendSignalSample(existing, sample(Number.NaN, false, 10));

    expect(next).toEqual(existing);
    expect(next).not.toBe(existing);
  });

  it('leaves an over-long window alone when the reading is dropped', () => {
    const existing = series(Array.from({ length: 70 }, (_, index) => index));
    const next = appendSignalSample(existing, sample(Number.POSITIVE_INFINITY), 10);

    expect(next).toHaveLength(70);
    expect(next[69].value).toBe(69);
  });
});

describe('computeSignalScale', () => {
  it('falls back to the full ADC scale with no finite values', () => {
    expect(computeSignalScale([])).toEqual({ low: 0, high: ADC_FULL_SCALE });
    expect(computeSignalScale([Number.NaN, Number.POSITIVE_INFINITY])).toEqual({ low: 0, high: ADC_FULL_SCALE });
  });

  it('pads the reading range', () => {
    expect(computeSignalScale([100, 200])).toEqual({ low: 88, high: 212 });
  });

  it('never collapses a flat signal below the minimum span', () => {
    const scale = computeSignalScale([500, 500]);
    expect(scale).toEqual({ low: 480, high: 520 });
    expect(scale.high - scale.low).toBeGreaterThanOrEqual(SIGNAL_MIN_SPAN);
  });

  it('includes a nearby clean-air baseline below and above the range', () => {
    expect(computeSignalScale([300, 340], 290)).toEqual({ low: 290, high: 345 });
    expect(computeSignalScale([300, 340], 400)).toEqual({ low: 295, high: 400 });
  });

  it('excludes a baseline that is too far away to be relevant', () => {
    expect(computeSignalScale([300, 340], 800)).toEqual({ low: 295, high: 345 });
    expect(computeSignalScale([100, 200], Number.NaN)).toEqual({ low: 88, high: 212 });
    expect(computeSignalScale([100, 200], null)).toEqual({ low: 88, high: 212 });
  });

  it('keeps the minimum span when clamping at either edge', () => {
    const low = computeSignalScale([2, 20]);
    expect(low).toEqual({ low: 0, high: 40 });
    expect(low.high - low.low).toBe(SIGNAL_MIN_SPAN);

    const high = computeSignalScale([995, 1015]);
    expect(high).toEqual({ low: 983, high: ADC_FULL_SCALE });
    expect(high.high - high.low).toBe(SIGNAL_MIN_SPAN);
  });

  it('clamps full-scale readings to the ADC range', () => {
    expect(computeSignalScale([0, ADC_FULL_SCALE])).toEqual({ low: 0, high: ADC_FULL_SCALE });
  });

  it('returns integers for fractional readings', () => {
    const scale = computeSignalScale([100.5, 118.3]);
    expect(Number.isInteger(scale.low)).toBe(true);
    expect(Number.isInteger(scale.high)).toBe(true);
    expect(scale.high - scale.low).toBeGreaterThanOrEqual(SIGNAL_MIN_SPAN);
  });
});

describe('barHeight', () => {
  const scale = { low: 0, high: 100 };

  it('maps the scale ends to the height bounds', () => {
    expect(barHeight(0, scale, 120)).toBe(2);
    expect(barHeight(100, scale, 120)).toBe(120);
    expect(barHeight(50, scale, 120)).toBe(61);
  });

  it('clamps values outside the scale', () => {
    expect(barHeight(-50, scale, 120)).toBe(2);
    expect(barHeight(250, scale, 120)).toBe(120);
  });

  it('falls back to the minimum bar height for broken input', () => {
    expect(barHeight(Number.NaN, scale, 120)).toBe(2);
    expect(barHeight(50, scale, 2)).toBe(2);
    expect(barHeight(50, scale, 10, 20)).toBe(20);
  });
});

describe('classifySignalSample', () => {
  const baseline = 120;

  it('treats an over-limit reading as over even when it is also rising', () => {
    expect(classifySignalSample(sample(baseline + 50, true), baseline)).toBe('over');
  });

  it('needs more than the rising margin before a reading counts as rising', () => {
    expect(classifySignalSample(sample(baseline + SIGNAL_RISING_MARGIN), baseline)).toBe('resting');
    expect(classifySignalSample(sample(baseline + SIGNAL_RISING_MARGIN + 1), baseline)).toBe('rising');
  });

  it('stays resting at or below the baseline', () => {
    expect(classifySignalSample(sample(baseline), baseline)).toBe('resting');
    expect(classifySignalSample(sample(10), baseline)).toBe('resting');
  });

  it('rests without a baseline even for a high reading', () => {
    expect(classifySignalSample(sample(900), null)).toBe('resting');
  });
});

describe('signalTrend', () => {
  it('compares the newest value with the value a lookback earlier', () => {
    expect(signalTrend([100, 101, 105, 108])).toEqual({ direction: 'up', delta: 8 });
    expect(signalTrend([100, 98, 95, 90])).toEqual({ direction: 'down', delta: -10 });
    expect(signalTrend([100, 102, 101, 102])).toEqual({ direction: 'steady', delta: 2 });
  });

  it('compares against the oldest value while the window is short', () => {
    expect(signalTrend([100, 103])).toEqual({ direction: 'up', delta: 3 });
    expect(signalTrend([100, 102])).toEqual({ direction: 'steady', delta: 2 });
  });

  it('ignores non-finite readings and rounds the delta', () => {
    const trend = signalTrend([100, 103.4, 103.4, 106.6]);
    expect(trend).toEqual({ direction: 'up', delta: 7 });
    expect(Number.isInteger(trend.delta)).toBe(true);
    expect(signalTrend([Number.NaN, 100, 106]).direction).toBe('up');
  });

  it('stays steady with fewer than two readings', () => {
    expect(signalTrend([])).toEqual({ direction: 'steady', delta: 0 });
    expect(signalTrend([42])).toEqual({ direction: 'steady', delta: 0 });
  });
});

describe('signalWindowSeconds', () => {
  it('is null without at least two samples', () => {
    expect(signalWindowSeconds([])).toBeNull();
    expect(signalWindowSeconds([sample(100, false, 1000)])).toBeNull();
  });

  it('rounds the elapsed window and never reports less than a second', () => {
    const round = [sample(100, false, 0), sample(101, false, 24_900)];
    expect(signalWindowSeconds(round, 24_900)).toBe(25);

    const short = [sample(100, false, 0), sample(101, false, 400)];
    expect(signalWindowSeconds(short, 400)).toBe(1);
  });

  it('accepts an explicit clock', () => {
    const samples = [sample(100, false, 0), sample(101, false, 0)];
    expect(signalWindowSeconds(samples, 24_000)).toBe(24);
  });
});

describe('describeSignal', () => {
  const now = Date.now();
  const window = [
    sample(130, false, now - 24_000),
    sample(118, false, now - 16_000),
    sample(161, false, now - 8_000),
    sample(142, false, now)
  ];

  it('reports an empty chart', () => {
    expect(describeSignal([])).toBe('Live signal chart. No readings yet.');
    expect(describeSignal([sample(Number.NaN, false, 1)])).toBe('Live signal chart. No readings yet.');
  });

  it('summarises the window, the trend and the clean-air level', () => {
    expect(describeSignal(window, 120)).toBe(
      'Live signal chart. Latest 142, lowest 118, highest 161 over the last 24 seconds. Rising by 12 counts. Clean-air level 120.'
    );
  });

  it('omits the clean-air level when there is no baseline', () => {
    expect(describeSignal(window)).toBe(
      'Live signal chart. Latest 142, lowest 118, highest 161 over the last 24 seconds. Rising by 12 counts.'
    );
  });

  it('omits the window with a single sample', () => {
    expect(describeSignal([sample(142, false, 1000)], 120)).toBe(
      'Live signal chart. Latest 142, lowest 142, highest 142. Steady. Clean-air level 120.'
    );
  });

  it('describes a falling signal', () => {
    expect(describeSignal([sample(200, false, now - 1000), sample(180, false, now)])).toBe(
      'Live signal chart. Latest 180, lowest 180, highest 200 over the last 1 seconds. Falling by 20 counts.'
    );
  });
});
