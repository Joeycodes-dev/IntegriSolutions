import type { CaseStatus } from '../types';

export const CASE_STATUSES: CaseStatus[] = [
  'new',
  'under_review',
  'verified',
  'referred',
  'invalidated',
  'closed'
];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  new: 'New',
  under_review: 'Under Review',
  verified: 'Verified',
  referred: 'Referred',
  invalidated: 'Invalidated',
  closed: 'Closed'
};

export const CASE_STATUS_STYLES: Record<CaseStatus, { badge: string; dot: string }> = {
  new: { badge: 'border-sky-200 bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
  under_review: { badge: 'border-violet-200 bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
  verified: { badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  referred: { badge: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  invalidated: { badge: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  closed: { badge: 'border-slate-200 bg-slate-100 text-slate-600', dot: 'bg-slate-400' }
};

export function isCaseStatus(value: string): value is CaseStatus {
  return (CASE_STATUSES as readonly string[]).includes(value);
}

export function formatCaseTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
