import type { TestDeviceCustody } from '../types';

/**
 * Maps breathalyzer custody columns on a `tests` row into the API payload shape.
 * Returns null for records captured before device custody tracking existed.
 */
export function mapDeviceCustodyRow(row: Record<string, unknown>): TestDeviceCustody | null {
  if (!row.device_transport) return null;

  const calibrationR0 = Number(row.device_calibration_r0);
  const sessionPeakRaw = Number(row.device_session_peak_raw);
  const avgRaw = Number(row.device_avg_raw);
  const raw = Number(row.device_raw);

  if (
    !Number.isFinite(calibrationR0) ||
    !Number.isFinite(sessionPeakRaw) ||
    !Number.isFinite(avgRaw) ||
    !Number.isFinite(raw)
  ) {
    return null;
  }

  return {
    transport: String(row.device_transport),
    serial: row.device_serial == null ? null : String(row.device_serial),
    calibrationVersion:
      row.device_calibration_version == null ? '' : String(row.device_calibration_version),
    calibrationR0,
    sessionPeakRaw,
    avgRaw,
    raw,
    capturedAt: row.device_captured_at == null ? '' : String(row.device_captured_at)
  };
}
