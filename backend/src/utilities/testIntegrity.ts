import { hashData } from './hash';

type TestRow = {
  officer_id: unknown;
  officer_name: string;
  badge_number: string;
  driver_name: string;
  driver_id: string;
  driver_dob: string;
  bac_reading: unknown;
  result: string;
  location: unknown;
  created_at: unknown;
  original_test_id?: string | null;
  hash?: string | null;
};

type HashPayload = Record<string, unknown>;

function uniqueValues(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  const unique: unknown[] = [];

  for (const value of values) {
    const key = JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }

  return unique;
}

function numberVariants(value: unknown): unknown[] {
  const variants = [value];
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric)) {
    variants.push(numeric);
  }
  return uniqueValues(variants);
}

function timestampVariants(value: unknown): unknown[] {
  if (typeof value !== 'string') return uniqueValues([value]);

  const variants: unknown[] = [value];
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    variants.push(date.toISOString());
  }
  return uniqueValues(variants);
}

function parseLocationForMobileHash(location: unknown): unknown {
  if (typeof location !== 'string') return location;

  try {
    return JSON.parse(location);
  } catch {
    return location;
  }
}

function locationVariants(location: unknown): unknown[] {
  const parsed = parseLocationForMobileHash(location);
  const variants = [location, parsed];

  if (parsed !== location && typeof parsed === 'object' && parsed !== null) {
    variants.push(JSON.stringify(parsed));
  }

  return uniqueValues(variants);
}

function originalTestIdVariants(value: string | null | undefined): unknown[] {
  if (value == null) return [null, undefined];
  return [value];
}

function dbHashPayload(row: TestRow, values: {
  officerId: unknown;
  bacReading: unknown;
  createdAt: unknown;
  location: unknown;
  originalTestId: unknown;
}): HashPayload {
  return {
    officer_id: values.officerId,
    officer_name: row.officer_name,
    badge_number: row.badge_number,
    driver_name: row.driver_name,
    driver_id: row.driver_id,
    driver_dob: row.driver_dob,
    bac_reading: values.bacReading,
    result: row.result,
    location: values.location,
    created_at: values.createdAt,
    original_test_id: values.originalTestId
  };
}

function mobileHashPayload(row: TestRow, values: {
  officerId: unknown;
  bacReading: unknown;
  createdAt: unknown;
  location: unknown;
  originalTestId: unknown;
}): HashPayload {
  return {
    officerId: values.officerId,
    officerName: row.officer_name,
    badgeNumber: row.badge_number,
    driverName: row.driver_name,
    driverId: row.driver_id,
    driverDob: row.driver_dob,
    bacReading: values.bacReading,
    result: row.result,
    location: values.location,
    createdAt: values.createdAt,
    originalTestId: values.originalTestId
  };
}

function withoutUndefinedValues(payload: HashPayload): HashPayload {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function candidatePayloads(row: TestRow): HashPayload[] {
  const payloads: HashPayload[] = [];

  for (const officerId of numberVariants(row.officer_id)) {
    for (const bacReading of numberVariants(row.bac_reading)) {
      for (const createdAt of timestampVariants(row.created_at)) {
        for (const location of locationVariants(row.location)) {
          for (const originalTestId of originalTestIdVariants(row.original_test_id)) {
            const values = { officerId, bacReading, createdAt, location, originalTestId };
            payloads.push(withoutUndefinedValues(dbHashPayload(row, values)));
            payloads.push(withoutUndefinedValues(mobileHashPayload(row, values)));
          }
        }
      }
    }
  }

  return payloads;
}

export function getTestHashValidity(row: TestRow): boolean | null {
  if (!row.hash) return null;

  const candidateHashes = new Set(candidatePayloads(row).map((payload) => hashData(payload)));

  return candidateHashes.has(row.hash);
}