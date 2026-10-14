import type { TestDeviceCustody } from '../types';

/**
 * A 6-octet colon-separated MAC address, e.g. `98:D3:31:FD:42:10`. Used to tell
 * a genuine Bluetooth Classic `@<MAC>` suffix apart from a serial that just
 * happens to contain an `@`.
 */
const MAC_ADDRESS = /^[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}$/;

/**
 * Splits a stored device serial that may embed a paired Bluetooth MAC address as
 * a trailing `@<MAC>` suffix back into its two halves:
 *
 * - `"MQ3-0001@98:D3:31:FD:42:10"` → `{ serial: 'MQ3-0001', deviceAddress: '98:D3:31:FD:42:10' }`
 * - `"@98:D3:31:FD:42:10"`          → `{ serial: null,        deviceAddress: '98:D3:31:FD:42:10' }`
 * - `"MQ3-0042"`                    → `{ serial: 'MQ3-0042',  deviceAddress: null }`
 * - `null`                          → `{ serial: null,        deviceAddress: null }`
 *
 * Values without a valid trailing MAC are returned untouched so a plain serial
 * such as `"serial@bot"` is never misread as a device address.
 */
export function parseCustodySerial(rawSerial: string | null): {
  serial: string | null;
  deviceAddress: string | null;
} {
  if (rawSerial == null) return { serial: null, deviceAddress: null };

  const at = rawSerial.lastIndexOf('@');
  if (at === -1) return { serial: rawSerial, deviceAddress: null };

  const deviceAddress = rawSerial.slice(at + 1).trim();
  if (!MAC_ADDRESS.test(deviceAddress)) {
    // Not an `@<MAC>` suffix; treat the whole value as the serial untouched.
    return { serial: rawSerial, deviceAddress: null };
  }

  const serial = rawSerial.slice(0, at).trim();
  return { serial: serial === '' ? null : serial, deviceAddress };
}

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

  // Keep the exact stored serial string (any `@<MAC>` suffix included) so the
  // hash contract and existing consumers see exactly what was persisted.
  const serial = row.device_serial == null ? null : String(row.device_serial);
  const { deviceAddress } = parseCustodySerial(serial);

  return {
    transport: String(row.device_transport),
    serial,
    calibrationVersion:
      row.device_calibration_version == null ? '' : String(row.device_calibration_version),
    calibrationR0,
    sessionPeakRaw,
    avgRaw,
    raw,
    capturedAt: row.device_captured_at == null ? '' : String(row.device_captured_at),
    // Only surface the paired Bluetooth MAC when the stored serial embedded one.
    ...(deviceAddress == null ? {} : { deviceAddress })
  };
}
