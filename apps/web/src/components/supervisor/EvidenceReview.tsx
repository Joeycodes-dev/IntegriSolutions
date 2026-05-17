import { useMemo, useState } from 'react';
import { generateEvidencePdf } from '../../lib/generateEvidencePdf';
import {
  ArrowLeft,
  FileDown,
  MapPin,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import type { TestRecord } from '../../types';
import { buildTestEvidence, resolveEvidencePhotoUrls } from '../../lib/testEvidence';
import { BORDER, NAVY, PAGE_BG, pageShell } from './supervisorStyles';

interface EvidenceReviewProps {
  test: TestRecord;
  onBack: () => void;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: BORDER }}>
      <p className="text-[9px] font-bold tracking-[0.1em] text-slate-500">{label}</p>
      <p className="mt-0.5 text-[0.8125rem] font-semibold leading-snug" style={{ color: NAVY }}>
        {value}
      </p>
    </div>
  );
}

export function EvidenceReview({ test, onBack }: EvidenceReviewProps) {
  const evidence = useMemo(() => buildTestEvidence(test), [test]);
  const photos = useMemo(() => resolveEvidencePhotoUrls(evidence.photoUrls), [evidence.photoUrls]);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      await generateEvidencePdf(test);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className={pageShell} style={{ backgroundColor: PAGE_BG }}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-6 py-4" style={{ borderColor: BORDER }}>
        <div className="flex min-w-0 items-start gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Back to logs"
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
              Evidence Review
            </h1>
            <p className="mt-0.5 text-[0.75rem] text-slate-500">
              Reference ID:{' '}
              <span className="font-mono font-medium text-slate-600">{evidence.referenceId}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleGeneratePdf()}
          disabled={generatingPdf}
          className="inline-flex h-[34px] shrink-0 items-center gap-2 rounded-lg px-3.5 text-[0.75rem] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: NAVY }}
        >
          <FileDown size={15} strokeWidth={2} />
          {generatingPdf ? 'Generating…' : 'Generate Court PDF'}
        </button>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-3 p-4 lg:grid-cols-2 lg:p-5">
        {/* Left column */}
        <div className="flex flex-col gap-3">
          <section className="rounded-xl border bg-white p-3.5" style={{ borderColor: BORDER }}>
            <h2 className="mb-2.5 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
              Driver &amp; Incident Details
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <DetailField label="DRIVER NAME" value={evidence.driverName} />
              <DetailField label="DRIVER ID" value={evidence.driverId} />
              <DetailField label="CATEGORY" value={evidence.driverCategory} />
              <DetailField label="READING" value={evidence.reading} />
              <DetailField label="OFFICER" value={evidence.officer} />
              <DetailField label="SERVICE NO" value={evidence.serviceNumber} />
              <DetailField label="RANK" value={evidence.rank} />
              <DetailField label="STATION" value={evidence.station} />
            </div>
          </section>

          <section className="rounded-xl border bg-white p-3.5" style={{ borderColor: BORDER }}>
            <h2 className="mb-2.5 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
              Photo Gallery
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {photos.slice(0, 2).map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className="aspect-[4/3] overflow-hidden rounded-lg border bg-slate-100"
                  style={{ borderColor: BORDER }}
                >
                  <img
                    src={url}
                    alt={`Evidence ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
            {evidence.photoUrls.length === 0 && (
              <p className="mt-2 text-[0.6875rem] text-slate-400">
                Placeholder photos shown until mobile evidence sync is available.
              </p>
            )}
          </section>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3">
          <section className="rounded-xl border bg-white p-3.5" style={{ borderColor: BORDER }}>
            <h2 className="mb-2.5 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
              Location &amp; Timing
            </h2>
            <div className="space-y-2 text-[0.8125rem]">
              <div>
                <p className="text-[9px] font-bold tracking-[0.1em] text-slate-500">TIMESTAMP</p>
                <p className="mt-0.5 font-semibold text-slate-800">{evidence.timestamp}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold tracking-[0.1em] text-slate-500">ROADBLOCK</p>
                <p className="mt-0.5 font-semibold text-slate-800">{evidence.roadblock}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold tracking-[0.1em] text-slate-500">LOCATION</p>
                <p className="mt-0.5 flex items-start gap-1 font-semibold text-slate-800">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-blue-600" strokeWidth={2} />
                  {evidence.locationLabel}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold tracking-[0.1em] text-slate-500">GPS</p>
                <p className="mt-0.5 font-mono text-[0.75rem] font-semibold text-slate-700">
                  {evidence.gps}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-3.5" style={{ borderColor: BORDER }}>
            <h2 className="mb-2 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
              Officer Notes
            </h2>
            <div
              className="min-h-[88px] rounded-lg border px-3 py-2.5 text-[0.8125rem] leading-relaxed text-slate-700"
              style={{ borderColor: BORDER }}
            >
              {evidence.officerNotes}
            </div>
          </section>

          <section className="rounded-xl border bg-white p-3.5" style={{ borderColor: BORDER }}>
            <h2 className="mb-2.5 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
              Supervisor Action
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg px-3 text-[0.75rem] font-bold text-white transition hover:brightness-110"
                style={{ backgroundColor: NAVY }}
              >
                <ShieldCheck size={15} strokeWidth={2} />
                Verify and Archive
              </button>
              <button
                type="button"
                className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-[0.75rem] font-bold text-amber-900 transition hover:bg-amber-100"
              >
                <ShieldAlert size={15} strokeWidth={2} className="text-amber-700" />
                Flag for Further Investigation
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
