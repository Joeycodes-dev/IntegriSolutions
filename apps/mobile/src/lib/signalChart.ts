/**
 * Pure maths for the live breathalyser signal chart. No React imports so the
 * same scaling can be reused by captions, logging and tests.
 */

export const ADC_FULL_SCALE = 1023;
export const SIGNAL_WINDOW_SAMPLES = 60; // newest samples kept
export const SIGNAL_MIN_SPAN = 40; // minimum y-range in ADC counts, so noise never looks like a signal
export const SIGNAL_RISING_MARGIN = 6; // counts above the clean-air level before a sample counts as rising
export const SIGNAL_TREND_LOOKBACK = 3; // newest value is compared with the value this many samples earlier
export const SIGNAL_TREND_THRESHOLD = 3; // counts of change needed before the trend is rising or falling

// A clean-air reference further than this from the reading range is left off
// the chart: pulling a distant baseline in would flatten the real signal.
const BASELINE_INCLUDE_RANGE = 120;

export interface SignalSample {
  value: number;
  over: boolean;
  at: number;
}

export interface SignalScale {
  low: number;
  high: number;
}

export type SignalClass = 'resting' | 'rising' | 'over';
export type SignalDirection = 'up' | 'down' | 'steady';

function finiteValues(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

function minMax(values: readonly number[]): { min: number; max: number } {
  let min = values[0];
  let max = values[0];
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] < min) min = values[index];
    if (values[index] > max) max = values[index];
  }
  return { min, max };
}

/**
 * Returns a NEW array holding the newest `limit` samples; the input is never
 * mutated. A non-finite reading is dropped rather than poisoning the scale.
 */
export function appendSignalSample(
  samples: readonly SignalSample[],
  sample: SignalSample,
  limit: number = SIGNAL_WINDOW_SAMPLES
): SignalSample[] {
  if (!Number.isFinite(sample.value)) {
    return [...samples];
  }
  const next = [...samples, sample];
  const size = Math.max(0, Math.floor(limit));
  if (size >= next.length) {
    return next;
  }
  return next.slice(next.length - size);
}

/**
 * Y-axis range that makes small ADC changes visible: the min/max of the
 * readings, padded, optionally widened to include a near clean-air baseline,
 * never narrower than SIGNAL_MIN_SPAN and clamped to the ADC full scale.
 */
export function computeSignalScale(values: readonly number[], baseline?: number | null): SignalScale {
  const finite = finiteValues(values);
  if (finite.length === 0) {
    return { low: 0, high: ADC_FULL_SCALE };
  }

  const { min, max } = minMax(finite);
  const padding = Math.max(2, Math.round((max - min) * 0.12));
  let low = min - padding;
  let high = max + padding;

  if (
    baseline !== null &&
    baseline !== undefined &&
    Number.isFinite(baseline) &&
    baseline >= min - BASELINE_INCLUDE_RANGE &&
    baseline <= max + BASELINE_INCLUDE_RANGE
  ) {
    low = Math.min(low, baseline);
    high = Math.max(high, baseline);
  }

  const span = high - low;
  if (span < SIGNAL_MIN_SPAN) {
    const mid = (low + high) / 2;
    low = mid - SIGNAL_MIN_SPAN / 2;
    high = mid + SIGNAL_MIN_SPAN / 2;
  }

  const targetSpan = high - low;
  if (low < 0) {
    low = 0;
    high = Math.min(ADC_FULL_SCALE, low + targetSpan);
  }
  if (high > ADC_FULL_SCALE) {
    high = ADC_FULL_SCALE;
    low = Math.max(0, high - targetSpan);
  }

  return { low: Math.floor(low), high: Math.ceil(high) };
}

/** Pixel height for one bar, mapped from `value` onto `scale`. */
export function barHeight(
  value: number,
  scale: SignalScale,
  maxHeight: number,
  minHeight: number = 2
): number {
  if (!Number.isFinite(value) || maxHeight <= minHeight) {
    return minHeight;
  }
  const range = scale.high - scale.low;
  if (range <= 0) {
    return value >= scale.high ? maxHeight : minHeight;
  }
  const ratio = Math.min(1, Math.max(0, (value - scale.low) / range));
  return minHeight + ratio * (maxHeight - minHeight);
}

export function classifySignalSample(sample: SignalSample, baseline: number | null): SignalClass {
  if (sample.over) {
    return 'over';
  }
  if (baseline !== null && Number.isFinite(baseline) && sample.value > baseline + SIGNAL_RISING_MARGIN) {
    return 'rising';
  }
  return 'resting';
}

/**
 * Compares the newest finite reading with the one SIGNAL_TREND_LOOKBACK
 * samples earlier (or the oldest reading when the window is still short).
 */
export function signalTrend(values: readonly number[]): { direction: SignalDirection; delta: number } {
  const finite = finiteValues(values);
  if (finite.length < 2) {
    return { direction: 'steady', delta: 0 };
  }
  const previous = finite[Math.max(0, finite.length - 1 - SIGNAL_TREND_LOOKBACK)];
  const delta = Math.round(finite[finite.length - 1] - previous);
  if (delta >= SIGNAL_TREND_THRESHOLD) {
    return { direction: 'up', delta };
  }
  if (delta <= -SIGNAL_TREND_THRESHOLD) {
    return { direction: 'down', delta };
  }
  return { direction: 'steady', delta };
}

export function signalWindowSeconds(samples: readonly SignalSample[], now: number = Date.now()): number | null {
  if (samples.length < 2) {
    return null;
  }
  return Math.max(1, Math.round((now - samples[0].at) / 1000));
}

/** One-sentence caption used for the chart's accessibility label. */
export function describeSignal(samples: readonly SignalSample[], baseline?: number | null): string {
  const finite = samples.filter((sample) => Number.isFinite(sample.value));
  if (finite.length === 0) {
    return 'Live signal chart. No readings yet.';
  }

  const { min, max } = minMax(finite.map((sample) => sample.value));
  let sentence = `Live signal chart. Latest ${Math.round(finite[finite.length - 1].value)}, lowest ${Math.round(
    min
  )}, highest ${Math.round(max)}`;

  const seconds = signalWindowSeconds(samples);
  if (seconds !== null) {
    sentence += ` over the last ${seconds} seconds`;
  }
  const parts = [`${sentence}.`];

  const trend = signalTrend(finite.map((sample) => sample.value));
  if (trend.direction === 'up') {
    parts.push(`Rising by ${Math.abs(trend.delta)} counts.`);
  } else if (trend.direction === 'down') {
    parts.push(`Falling by ${Math.abs(trend.delta)} counts.`);
  } else {
    parts.push('Steady.');
  }

  if (baseline !== null && baseline !== undefined && Number.isFinite(baseline)) {
    parts.push(`Clean-air level ${Math.round(baseline)}.`);
  }

  return parts.join(' ');
}
