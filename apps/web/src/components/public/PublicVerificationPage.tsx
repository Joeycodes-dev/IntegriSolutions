import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { getPublicVerification } from '../../services/api';
import type { PublicVerification, VerificationHashStatus } from '../../types';

interface PublicVerificationPageProps {
  token: string;
}

const STATUS_META: Record<VerificationHashStatus, { label: string; badge: string; box: string }> = {
  verified: {
    label: 'Record verified',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    box: 'border-emerald-200 bg-emerald-50/50'
  },
  tampered: {
    label: 'Integrity compromised',
    badge: 'bg-red-50 text-red-700 border-red-200',
    box: 'border-red-200 bg-red-50/60'
  },
  unavailable: {
    label: 'Integrity unavailable',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    box: 'border-slate-200 bg-slate-50'
  }
};

function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-800 break-all">{value}</dd>
    </div>
  );
}

export function PublicVerificationPage({ token }: PublicVerificationPageProps) {
  const [data, setData] = useState<PublicVerification | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    getPublicVerification(token)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Verification failed');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const statusMeta = data ? STATUS_META[data.hashStatus] : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="mb-5 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
            IntegriScan
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Court Record Verification</h1>
        </div>

        {error && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <ShieldQuestion size={28} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">
              This verification link is invalid or no longer available.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Request a fresh export from the supervising authority if you believe this is an error.
            </p>
          </div>
        )}

        {!error && !data && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
            <p className="mt-3 text-sm text-slate-500">Verifying record…</p>
          </div>
        )}

        {data && statusMeta && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className={`flex items-center justify-between gap-2 border-b px-5 py-3.5 ${statusMeta.box}`}>
              <div className="flex items-center gap-2">
                {data.hashStatus === 'verified' ? (
                  <ShieldCheck size={18} className="text-emerald-600" />
                ) : (
                  <ShieldAlert size={18} className={data.hashStatus === 'tampered' ? 'text-red-600' : 'text-slate-400'} />
                )}
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${statusMeta.badge}`}>
                  {statusMeta.label}
                </span>
              </div>
            </div>

            <dl className="px-5 py-3">
              <DetailRow label="Reference ID" value={data.referenceId} />
              <DetailRow label="Recorded at" value={formatUtc(data.timestamp)} />
              <DetailRow label="Verification issued" value={formatUtc(data.issuedAt)} />
              <DetailRow label="Officer badge" value={data.officerBadge} />
              <DetailRow label="Driver" value={data.driver.name} />
              <DetailRow label="Licence" value={data.driver.id} />
            </dl>

            <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] leading-relaxed text-slate-400">
              This page verifies the integrity of the electronic test record shown in the
              corresponding PDF. It does not certify the PDF file itself or the authenticity of
              attached photographs.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
