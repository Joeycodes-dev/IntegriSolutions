import {
  bacGdlToRaw,
  cleanAirRaw,
  adcToVolts,
  voltsToRs,
  type BreathalyzerCalibration,
  type BreathalyzerDeviceState,
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
const SIMULATED_SERIAL = 'MQ3-SIM1';
const SIMULATED_VCC_MV = 5000;
const SIMULATED_SPREAD = 2;
const SIMULATED_R0_OHMS = 7532;

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

/**
 * Appends the firmware's trailing `,"crc":"XX"` field: an 8-bit XOR of every
 * character after the opening `{` up to the separator that precedes `"crc"`.
 * The closing brace is written after the checksum, exactly like the sketch.
 */
function appendChecksum(payload: string): string {
  const body = payload.slice(0, -1);
  let checksum = 0;
  for (let index = 1; index < body.length; index += 1) {
    checksum ^= body.charCodeAt(index) & 0xff;
  }
  const hex = checksum.toString(16).toUpperCase().padStart(2, '0');
  return `${body},"crc":"${hex}"}`;
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
  let seq = 0;
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

    // Mirror the firmware state machine so the session derives a blow state.
    let state: BreathalyzerDeviceState;
    if (warm) state = 'WARM';
    else if (fraction >= 1) state = 'PEAK';
    else if (fraction > 0) state = 'BLOW';
    else state = 'IDLE';

    const vout = adcToVolts(raw);
    const rs = voltsToRs(vout, calibration.loadResistorOhms);

    seq += 1;

    emit(
      `${appendChecksum(
        JSON.stringify({
          raw,
          avg: ema,
          peak,
          sn: SIMULATED_SERIAL,
          vout: Number(vout.toFixed(3)),
          rs: rs === null ? -1 : Math.round(rs),
          over,
          alarm,
          warm,
          seq,
          up: Math.max(0, elapsed),
          vcc: SIMULATED_VCC_MV,
          spread: SIMULATED_SPREAD,
          r0: SIMULATED_R0_OHMS,
          fault: 'ok' as const,
          state
        })
      )}\n`
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
      seq = 0;
      interval = setInterval(tick, sampleIntervalMs);
    },
    async disconnect() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
    sendCommand(command: string) {
      const normalized = String(command).trim().toUpperCase();
      if (normalized === 'RST') {
        peak = ema;
        alarm = false;
      }
      return Promise.resolve();
    },
    onLine(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
