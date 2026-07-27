import { ArrowLeft } from 'lucide-react';
import type { FieldOfficer } from '../../types';
import {
  formatSouthAfricanPhone,
  parseOfficerLocation
} from '../../lib/officerLocation';
import { BORDER, NAVY, PAGE_BG, pageShell } from './supervisorStyles';

const RANK_BLUE = '#2563EB';

interface OfficerInformationProps {
  officer: FieldOfficer;
  onBack: () => void;
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

export function OfficerInformation({ officer, onBack }: OfficerInformationProps) {
  const location = parseOfficerLocation(officer.station);
  const fullName = `${officer.firstName} ${officer.surname}`.trim() || officer.name;

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
          <div>
            <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
              Officer Information
            </h1>
            <p className="mt-0.5 text-[0.75rem] text-slate-500">Officer&apos;s Details</p>
          </div>
        </div>

        <div
          className="mx-auto w-full max-w-[720px] rounded-xl border bg-white px-5 py-5 shadow-sm"
          style={{ borderColor: BORDER }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoField label="Full Name" value={fullName} />
            <InfoField label="Service Number" value={officer.serviceNumber} />
            <InfoField label="Rank" value={officer.rank} valueColor={RANK_BLUE} />
            <InfoField label="Phone" value={formatSouthAfricanPhone(location.phone)} />
          </div>

          <div className="mt-3 space-y-3">
            <InfoField label="Email" value={officer.email} />
            <InfoField label="Address" value={location.address} />
          </div>
        </div>
      </div>
    </div>
  );
}
