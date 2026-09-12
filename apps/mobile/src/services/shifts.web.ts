import { API_BASE_URL } from './constants';
import { getAccessToken } from './auth';

const SELECTED_SHIFT_KEY = 'integiscan_selected_roadblock_shift';

export type RoadblockShiftStatus = 'scheduled' | 'active' | 'closed' | 'cancelled';

export interface RoadblockShift {
  id: string;
  roadblockName: string;
  station: string;
  supervisorEmail: string;
  supervisorName: string | null;
  startsAt: string;
  endsAt: string;
  status: RoadblockShiftStatus;
  centerLat: number | null;
  centerLng: number | null;
  radiusMeters: number | null;
  notes: string | null;
  assignmentStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

function extractErrorMessage(payload: unknown): string {
  const candidate = (payload as { error?: unknown })?.error;
  return typeof candidate === 'string' && candidate.trim() ? candidate : 'API request failed';
}

export function isRoadblockShiftActive(shift: RoadblockShift | null): shift is RoadblockShift {
  if (!shift || shift.status === 'closed' || shift.status === 'cancelled') return false;
  const now = Date.now();
  const startsAt = new Date(shift.startsAt).getTime();
  const endsAt = new Date(shift.endsAt).getTime();
  return Number.isFinite(startsAt) && Number.isFinite(endsAt) && startsAt <= now && now <= endsAt;
}

export async function getActiveRoadblockShifts(): Promise<RoadblockShift[]> {
  const token = await getAccessToken();
  if (!token) return [];

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/shifts/active`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    throw new Error(`Network error requesting active roadblocks: ${error instanceof Error ? error.message : String(error)}`);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractErrorMessage(payload));
  }

  return Array.isArray(payload) ? payload as RoadblockShift[] : [];
}

/**
 * Web counterpart of services/shifts.ts (expo-secure-store has no web backend).
 * A selected shift carries no credentials and no sensitive personal data — the
 * closest thing is supervisorEmail, a work contact already shown elsewhere in
 * the UI — so unlike the auth token/profile, this is safe to persist in
 * localStorage for a normal (non-security-sensitive) UX across reloads. Storage
 * access is wrapped so an unavailable/blocked localStorage (private browsing,
 * disabled storage, etc.) degrades to "no persisted selection" instead of
 * throwing.
 */
export async function saveSelectedRoadblockShift(shift: RoadblockShift): Promise<void> {
  try {
    window.localStorage.setItem(SELECTED_SHIFT_KEY, JSON.stringify(shift));
  } catch {
    // Browser storage unavailable — selection just won't survive a reload.
  }
}

export async function getSelectedRoadblockShift(): Promise<RoadblockShift | null> {
  try {
    const raw = window.localStorage.getItem(SELECTED_SHIFT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as RoadblockShift;
    } catch {
      window.localStorage.removeItem(SELECTED_SHIFT_KEY);
      return null;
    }
  } catch {
    return null;
  }
}

export async function clearSelectedRoadblockShift(): Promise<void> {
  try {
    window.localStorage.removeItem(SELECTED_SHIFT_KEY);
  } catch {
    // ignore
  }
}
