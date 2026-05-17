import type { TestEvidence, TestRecord } from '../types';

export interface ParsedLocation {
  lat?: number;
  lng?: number;
  label?: string;
  roadblock?: string;
  officerNotes?: string;
  photoUrls?: string[];
  officerRank?: string;
  serviceNumber?: string;
  station?: string;
  driverCategory?: string;
}

export function parseTestLocation(location?: string): ParsedLocation {
  if (!location?.trim()) return {};

  try {
    const parsed = JSON.parse(location) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      return {
        lat: typeof parsed.lat === 'number' ? parsed.lat : undefined,
        lng: typeof parsed.lng === 'number' ? parsed.lng : undefined,
        label: typeof parsed.label === 'string' ? parsed.label : typeof parsed.address === 'string' ? parsed.address : undefined,
        roadblock: typeof parsed.roadblock === 'string' ? parsed.roadblock : undefined,
        officerNotes: typeof parsed.officerNotes === 'string' ? parsed.officerNotes : undefined,
        photoUrls: Array.isArray(parsed.photoUrls)
          ? parsed.photoUrls.filter((u): u is string => typeof u === 'string')
          : undefined,
        officerRank: typeof parsed.officerRank === 'string' ? parsed.officerRank : undefined,
        serviceNumber: typeof parsed.serviceNumber === 'string' ? parsed.serviceNumber : undefined,
        station: typeof parsed.station === 'string' ? parsed.station : undefined,
        driverCategory:
          typeof parsed.driverCategory === 'string' ? parsed.driverCategory : undefined
      };
    }
  } catch {
    return { label: location };
  }

  return { label: location };
}

export function formatReferenceId(testId: string): string {
  const compact = testId.replace(/-/g, '').toUpperCase();
  const mid = compact.slice(0, 10) || 'UNKNOWN';
  const tail = compact.slice(-4) || '0000';
  return `ARW-${mid}-${tail}`;
}

/** Court / PDF reference format, e.g. IS-2026-04-07-004 */
export function formatCourtReferenceId(testId: string, createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return formatReferenceId(testId).replace(/^ARW/, 'IS');
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const tail = testId.replace(/\D/g, '').slice(-3).padStart(3, '0') || '001';
  return `IS-${ymd}-${tail}`;
}

export const PLACEHOLDER_EVIDENCE_PHOTOS = [
  'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b8?auto=format&fit=crop&w=640&q=80',
  'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=640&q=80'
] as const;

export function resolveEvidencePhotoUrls(urls: string[]): string[] {
  if (urls.length >= 2) return urls.slice(0, 2);
  if (urls.length === 1) return [urls[0], PLACEHOLDER_EVIDENCE_PHOTOS[1]];
  return [...PLACEHOLDER_EVIDENCE_PHOTOS];
}

export function formatDriverCategoryForReport(category: string): string {
  if (category.includes('0.02')) return 'Professional (limit 0.02 g/100ml)';
  if (category.includes('0.05')) return 'General (limit 0.05 g/100ml)';
  return category.replace(/General Driver/i, 'General').replace(/limit\s+/i, 'limit ');
}

export function formatEvidenceTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatOfficerDisplay(name: string, rank?: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return rank ? `${rank} ${name}` : name;

  const initials = parts
    .slice(0, -1)
    .map((p) => `${p.charAt(0).toUpperCase()}.`)
    .join(' ');
  const surname = parts[parts.length - 1];
  const base = `${initials} ${surname}`;
  return rank?.toLowerCase().includes('constable') || rank?.toLowerCase().includes('cst')
    ? `Cst. ${base}`
    : rank
      ? `${rank} ${base}`
      : `Cst. ${base}`;
}

export function buildTestEvidence(test: TestRecord): TestEvidence {
  const parsed = parseTestLocation(test.location);
  const merged = { ...parsed, ...test.evidence };

  const station = merged.station ?? merged.roadblock ?? '—';
  const roadblock = merged.roadblock ?? station;
  const limit = merged.driverCategory?.includes('0.02') ? 0.02 : 0.05;

  return {
    referenceId: formatReferenceId(test.id),
    driverName: test.driverName,
    driverId: test.driverId,
    driverCategory:
      merged.driverCategory ??
      `General Driver (limit ${limit.toFixed(2)}g/100ml)`,
    reading: `${test.bacReading.toFixed(2)} g/100ml`,
    officer: formatOfficerDisplay(test.officerName, merged.officerRank),
    serviceNumber: merged.serviceNumber ?? test.badgeNumber,
    rank: merged.officerRank ?? 'Constable',
    station,
    timestamp: formatEvidenceTimestamp(test.createdAt),
    roadblock,
    locationLabel: merged.label ?? 'Location pending sync from mobile',
    gps:
      merged.lat != null && merged.lng != null
        ? `${merged.lat.toFixed(4)}, ${merged.lng.toFixed(4)}`
        : '—',
    officerNotes:
      merged.officerNotes ??
      (test.result === 'fail'
        ? 'Awaiting officer notes from mobile submission.'
        : 'No additional notes recorded.'),
    photoUrls: merged.photoUrls ?? []
  };
}
