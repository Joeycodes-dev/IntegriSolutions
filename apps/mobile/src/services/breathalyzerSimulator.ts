import {
  bacGdlToRaw,
  cleanAirRaw,
  adcToVolts,
  voltsToRs,
  type BreathalyzerCalibration,
  type BreathalyzerTransport
} from './breathalyzer';

export interface SimulatedTransportOptions {
  baselineRaw?: number;
  targetBacGdl?: number;
  calibration: BreathalyzerCalibration;
  sampleIntervalMs?: number;
  warmupMs?: number;
  cycleMs?: number;
  alarmThresholdRaw?: number;
}

const NOISE_RAW = 2;
const ALARM_HYSTERESIS = 20;

function smoothstep(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped * clamped * (3 - 2 * clamped);
}

function breathFraction(elapsedMs: number, cycleMs: number): number {
  const idleMs = cycleMs * 0.35;
  const riseMs = cycleMs * 0.25;
  const holdMs = cycleMs * 0.15;
  const decayMs = cycleMs - idleMs - riseMs - holdMs;
  const position = elapsedMs % cycleMs;

  if (position < idleMs) return 0;
  if (position < idleMs + riseMs) {
    return smoothstep((position - idleMs) / riseMs);
  }
  if (position < idleMs + riseMs + holdMs) return 1;
  return 1 - smoothstep((position - idleMs - riseMs - holdMs) / decayMs);
}

export function createSimulatedTransport(options: SimulatedTransportOptions): BreathalyzerTransport {
  const calibration = options.calibration;
  const baselineRaw = options.baselineRaw ?? cleanAirRaw(calibration);
  const targetRaw = bacGdlToRaw(options.targetBacGdl ?? 0.062, calibration);
  const sampleIntervalMs = options.sampleIntervalMs ?? 250;
  const warmupMs = options.warmupMs ?? 3000;
  const cycleMs = options.cycleMs ?? 30000;
  const alarmThresholdRaw = options.alarmThresholdRaw ?? 350;

  const listeners = new Set<(line: string) => void>();
  let interval: ReturnType<typeof setInterval> | null = null;
  let startedAt = 0;
  let ema = baselineRaw;
  let peak = baselineRaw;
  let alarm = false;

  const emit = (line: string) => {
    for (const listener of listeners) {
      listener(line);
    }
  };

  const tick = () => {
    const elapsed = Date.now() - startedAt;
    const warm = elapsed < warmupMs;
    const fraction = warm ? 0 : breathFraction(elapsed, cycleMs);
    const raw = Math.round(
      baselineRaw + (targetRaw - baselineRaw) * fraction + (Math.random() * 2 - 1) * NOISE_RAW
    );

    ema = Math.round((ema * 3 + raw) / 4);

    if (!warm) {
      if (ema > peak) peak = ema;
      if (ema < alarmThresholdRaw - 100 && peak > ema) peak -= 2;
    }

    const over = ema > alarmThresholdRaw;
    if (over) {
      alarm = true;
    } else if (ema < alarmThresholdRaw - ALARM_HYSTERESIS) {
      alarm = false;
    }

    const vout = adcToVolts(raw);
    const rs = voltsToRs(vout, calibration.loadResistorOhms);

    emit(
      `${JSON.stringify({
        raw,
        avg: ema,
        peak,
        vout: Number(vout.toFixed(3)),
        rs: rs === null ? -1 : Math.round(rs),
        over,
        alarm,
        warm
      })}\n`
    );
  };

  return {
    kind: 'simulated',
    label: 'Simulated MQ-3 device',
    async connect() {
      if (interval) return;
      startedAt = Date.now();
      ema = baselineRaw;
      peak = baselineRaw;
      alarm = false;
      interval = setInterval(tick, sampleIntervalMs);
    },
    async disconnect() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
    onLine(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
