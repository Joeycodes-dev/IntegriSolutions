/** Court evidence fields embedded in tests.location JSON (synced to web). */
export interface TestLocationPayload {
  lat: number;
  lng: number;
  roadblock?: string;
  station?: string;
  officerRank?: string;
  serviceNumber?: string;
  officerNotes?: string;
  label?: string;
  driverCategory?: string;
}

/** Parse station/address from officer profile.region (plain text or JSON). */
export function stationFromProfileRegion(region?: string): string {
  const trimmed = region?.trim() ?? '';
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.address === 'string' && parsed.address.trim()) {
        return parsed.address.trim();
      }
      if (typeof parsed.station === 'string' && parsed.station.trim()) {
        return parsed.station.trim();
      }
    }
  } catch {
    // plain text
  }

  return trimmed;
}

export function buildTestLocation(params: {
  lat: number;
  lng: number;
  roadblock: string;
  station: string;
  officerRank: string;
  serviceNumber: string;
  officerNotes: string;
  driverCategory: string;
}): TestLocationPayload {
  const roadblock = params.roadblock.trim();
  const station = params.station.trim();
  const officerRank = params.officerRank.trim();
  const serviceNumber = params.serviceNumber.trim();
  const officerNotes = params.officerNotes.trim();
  const driverCategory = params.driverCategory.trim();

  return {
    lat: params.lat,
    lng: params.lng,
    ...(roadblock ? { roadblock } : {}),
    ...(station ? { station } : {}),
    ...(officerRank ? { officerRank } : {}),
    ...(serviceNumber ? { serviceNumber } : {}),
    ...(officerNotes ? { officerNotes } : {}),
    ...(driverCategory ? { driverCategory } : {}),
    label: roadblock || station || undefined
  };
}

export const DRIVER_CATEGORIES = [
  'General Driver (limit 0.05g/100ml)',
  'Professional (limit 0.02g/100ml)'
] as const;
