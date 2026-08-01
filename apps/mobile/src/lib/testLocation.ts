/** Court evidence fields embedded in tests.location JSON (synced to web). */
export interface TestLocationPayload {
  lat: number;
  lng: number;
  roadblockId?: string;
  roadblock?: string;
  station?: string;
  locationBounds?: {
    centerLat: number;
    centerLng: number;
    radiusMeters: number;
  };
  supervisorEmail?: string;
  supervisorName?: string;
  shiftStartsAt?: string;
  shiftEndsAt?: string;
  officerRank?: string;
  serviceNumber?: string;
  officerNotes?: string;
  label?: string;
  driverCategory?: string;
}

export interface RoadblockShiftSnapshot {
  id: string;
  roadblockName: string;
  station: string;
  supervisorEmail: string;
  supervisorName: string | null;
  startsAt: string;
  endsAt: string;
  centerLat: number | null;
  centerLng: number | null;
  radiusMeters: number | null;
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
  roadblockShift?: RoadblockShiftSnapshot | null;
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
  const shift = params.roadblockShift;
  const shiftRoadblock = shift?.roadblockName.trim() || roadblock;
  const shiftStation = shift?.station.trim() || station;
  const hasBounds =
    shift?.centerLat != null &&
    shift.centerLng != null &&
    shift.radiusMeters != null;

  return {
    lat: params.lat,
    lng: params.lng,
    ...(shift ? { roadblockId: shift.id } : {}),
    ...(shiftRoadblock ? { roadblock: shiftRoadblock } : {}),
    ...(shiftStation ? { station: shiftStation } : {}),
    ...(hasBounds ? {
      locationBounds: {
        centerLat: shift.centerLat as number,
        centerLng: shift.centerLng as number,
        radiusMeters: shift.radiusMeters as number
      }
    } : {}),
    ...(shift?.supervisorEmail ? { supervisorEmail: shift.supervisorEmail } : {}),
    ...(shift?.supervisorName ? { supervisorName: shift.supervisorName } : {}),
    ...(shift?.startsAt ? { shiftStartsAt: shift.startsAt } : {}),
    ...(shift?.endsAt ? { shiftEndsAt: shift.endsAt } : {}),
    ...(officerRank ? { officerRank } : {}),
    ...(serviceNumber ? { serviceNumber } : {}),
    ...(officerNotes ? { officerNotes } : {}),
    ...(driverCategory ? { driverCategory } : {}),
    label: shiftRoadblock || shiftStation || undefined
  };
}

export const DRIVER_CATEGORIES = [
  'General Driver (limit 0.05g/100ml)',
  'Professional (limit 0.02g/100ml)'
] as const;
