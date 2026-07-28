import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { FieldOfficer } from '../../types';
import { updateFieldOfficer } from '../../services/api';
import {
  formatSouthAfricanPhone,
  parseOfficerLocation
} from '../../lib/officerLocation';
import { BORDER, NAVY, PAGE_BG, pageShell } from './supervisorStyles';

const RANK_BLUE = '#2563EB';

interface OfficerInformationProps {
  officer: FieldOfficer;
  onBack: () => void;
  onUpdated?: (officer: FieldOfficer) => void;
}

function InfoField({
  label,
  value,
  valueColor
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div
      className="rounded-lg border bg-white px-3 py-2.5"
      style={{ borderColor: BORDER }}
    >
      <p className="text-[0.6875rem] font-medium text-slate-500">{label}</p>
      <p
        className="mt-1 text-[0.8125rem] font-semibold leading-snug"
        style={{ color: valueColor ?? '#0f172a' }}
      >
        {value}
      </p>
    </div>
  );
}

export function OfficerInformation({ officer, onBack, onUpdated }: OfficerInformationProps) {
  const [current, setCurrent] = useState(officer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const location = parseOfficerLocation(current.station);
  const fullName = `${current.firstName} ${current.surname}`.trim() || current.name;
  const shift = location.shift || 'Unassigned';
  const isActive = current.status.toLowerCase() === 'active';
  const nextStatus = isActive ? 'Inactive' : 'Active';

  const handleToggleStatus = async () => {
    if (!window.confirm(`Set ${fullName} to ${nextStatus}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateFieldOfficer(current.officerId, { status: nextStatus });
      setCurrent(updated);
      onUpdated?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update officer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${pageShell} min-w-0`} style={{ backgroundColor: PAGE_BG }}>
      <div className="flex-1 px-5 py-5">
        <div className="mb-4 flex items-start gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Back to officers"
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
              Officer Information
            </h1>
            <p className="mt-0.5 text-[0.75rem] text-slate-500">
              Officer details. Test records remain immutable — only account status can change.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleStatus()}
            disabled={busy || current.status.toLowerCase() === 'invited'}
            className="h-[34px] shrink-0 rounded-lg px-3 text-[0.75rem] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: isActive ? '#b45309' : NAVY }}
          >
            {busy ? 'Updating…' : nextStatus === 'Inactive' ? 'Deactivate' : 'Activate'}
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-700">
            {error}
          </div>
        )}

        <div
          className="mx-auto w-full max-w-[720px] rounded-xl border bg-white px-5 py-5 shadow-sm"
          style={{ borderColor: BORDER }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoField label="Full Name" value={fullName} />
            <InfoField label="Service Number" value={current.serviceNumber} />
            <InfoField label="Rank" value={current.rank} valueColor={RANK_BLUE} />
            <InfoField label="Phone" value={formatSouthAfricanPhone(location.phone)} />
            <InfoField label="Employment Status" value={current.status || '—'} />
            <InfoField label="Shift" value={shift} />
          </div>

          <div className="mt-3 space-y-3">
            <InfoField label="Email" value={current.email} />
            <InfoField label="Address" value={location.address} />
          </div>
        </div>
      </div>
    </div>
  );
}
