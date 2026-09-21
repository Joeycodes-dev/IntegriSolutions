import { Cpu, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { TestRecord } from '../../types';
import { formatEvidenceTimestamp } from '../../lib/testEvidence';
import { BORDER, NAVY } from './supervisorStyles';

interface DeviceCustodyPanelProps {
  test: TestRecord;
}

function transportLabel(transport: string): string {
  if (transport === 'ble') return 'Bluetooth LE';
  if (transport === 'simulated') return 'Simulated device';
  return transport;
}

function formatRawCounts(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)} counts` : '—';
}

function formatResistance(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)} Ω` : '—';
}

function CustodyField({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: BORDER }}>
      <p className="text-[9px] font-bold tracking-[0.1em] text-slate-500">{label}</p>
      <p
        className={`mt-0.5 text-[0.8125rem] font-semibold leading-snug ${
          mono ? 'font-mono text-[0.75rem]' : ''
        }`}
        style={{ color: NAVY }}
      >
        {value}
      </p>
    </div>
  );
}

export function DeviceCustodyPanel({ test }: DeviceCustodyPanelProps) {
  const device = test.device ?? null;

  if (!device) {
    return (
      <section className="rounded-xl border bg-white p-3.5" style={{ borderColor: BORDER }}>
        <h2 className="mb-2 flex items-center gap-1.5 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
          <Cpu size={14} strokeWidth={2} className="text-slate-400" />
          Device Custody
        </h2>
        <p className="text-[0.6875rem] text-slate-400">
          No breathalyzer custody data on this record — it was captured before device tracking or
          without a connected device.
        </p>
      </section>
    );
  }

  const isSimulated = device.transport === 'simulated';

  return (
    <section className="rounded-xl border bg-white p-3.5" style={{ borderColor: BORDER }}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
          <Cpu size={14} strokeWidth={2} className="text-slate-500" />
          Device Custody
        </h2>
        {isSimulated && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            <TriangleAlert size={11} strokeWidth={2} />
            Simulated device
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CustodyField
          label="DEVICE"
          value={transportLabel(device.transport)}
        />
        <CustodyField label="SERIAL" value={device.serial?.trim() || 'Not reported'} mono={!!device.serial} />
        <CustodyField label="CALIBRATION" value={device.calibrationVersion || 'Unversioned'} />
        <CustodyField label="CLEAN-AIR R0" value={formatResistance(device.calibrationR0)} />
        <CustodyField label="SESSION PEAK" value={formatRawCounts(device.sessionPeakRaw)} />
        <CustodyField label="SMOOTHED AT CAPTURE" value={formatRawCounts(device.avgRaw)} />
        <CustodyField label="INSTANT AT CAPTURE" value={formatRawCounts(device.raw)} />
        <CustodyField
          label="CAPTURED AT"
          value={device.capturedAt ? formatEvidenceTimestamp(device.capturedAt) : '—'}
        />
      </div>

      {test.hashValid === true && (
        <p className="mt-2.5 flex items-start gap-1.5 text-[0.6875rem] font-medium text-emerald-700">
          <ShieldCheck size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
          Device metadata is covered by the verified record hash.
        </p>
      )}
      {test.hashValid === false && (
        <p className="mt-2.5 flex items-start gap-1.5 text-[0.6875rem] font-semibold text-rose-700">
          <ShieldAlert size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
          Record hash verification failed — custody data may have been altered.
        </p>
      )}
      {test.hashValid !== true && test.hashValid !== false && (
        <p className="mt-2.5 flex items-start gap-1.5 text-[0.6875rem] text-slate-500">
          <ShieldCheck size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-slate-400" />
          Device metadata is covered by the record integrity hash.
        </p>
      )}
    </section>
  );
}
