import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, TimerOff } from 'lucide-react';
import type { SessionInterruption, SessionInterruptionKind } from '../../types';
import { getSessionInterruptions } from '../../services/api';
import { formatDayAwareDateTimeNumeric } from '../../lib/dateTime';
import { BORDER, NAVY, PAGE_BG, pageContent, pageShell } from './supervisorStyles';

const KIND_FILTERS: Array<{ value: '' | SessionInterruptionKind; label: string }> = [
  { value: '', label: 'All' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'navigated_away', label: 'Left mid-session' },
  { value: 'app_closed', label: 'Closed app' }
];

function kindLabel(kind: SessionInterruptionKind): string {
  if (kind === 'cancelled') return 'Cancelled session';
  if (kind === 'navigated_away') return 'Left mid-session';
  return 'Closed app mid-session';
}

function kindStyles(kind: SessionInterruptionKind): string {
  if (kind === 'cancelled') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (kind === 'navigated_away') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function stepLabel(step: string): string {
  return step === 'reading' ? 'Step 2 — BAC reading' : 'Step 1 — Licence scan';
}

export function SupervisorInterruptions() {
  const [items, setItems] = useState<SessionInterruption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<'' | SessionInterruptionKind>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getSessionInterruptions(kindFilter || undefined));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session interruptions');
    } finally {
      setLoading(false);
    }
  }, [kindFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={pageShell} style={{ backgroundColor: PAGE_BG }}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
            Session Interruptions
          </h1>
          <p className="mt-0.5 text-[0.75rem] text-slate-500">
            Officers who cancelled, navigated away from, or closed the app during an unfinished test session.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-[34px] items-center gap-2 rounded-lg border bg-white px-3.5 text-[0.75rem] font-bold text-slate-700 transition hover:bg-slate-50"
          style={{ borderColor: BORDER }}
        >
          <RefreshCw size={14} strokeWidth={2} />
          Refresh
        </button>
      </header>

      <div className={`${pageContent} flex flex-col gap-4`}>
        {error && (
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-700">
            {error}
          </div>
        )}

        <section className="rounded-xl border bg-white" style={{ borderColor: BORDER }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: BORDER }}>
            <h2 className="text-[0.875rem] font-bold" style={{ color: NAVY }}>
              Interrupted Sessions
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {KIND_FILTERS.map((filter) => (
                <button
                  key={filter.value || 'all'}
                  type="button"
                  onClick={() => setKindFilter(filter.value)}
                  className={`rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold transition ${
                    kindFilter === filter.value
                      ? 'border-[#0D2137]/40 bg-[#0D2137]/5 text-slate-900'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                  style={{ borderColor: kindFilter === filter.value ? undefined : BORDER }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y" style={{ borderColor: BORDER }}>
            {loading ? (
              <p className="flex items-center justify-center gap-2 px-4 py-8 text-[0.75rem] text-slate-500">
                <Loader2 size={15} className="animate-spin text-slate-400" /> Loading…
              </p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <TimerOff size={28} className="text-slate-300" />
                <p className="text-[0.75rem] text-slate-500">No interrupted sessions recorded.</p>
              </div>
            ) : (
              items.map((item) => (
                <article key={item.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.8125rem] font-bold text-slate-900">{item.officerName}</span>
                    {item.badgeNumber && (
                      <span className="text-[0.6875rem] text-slate-500">· {item.badgeNumber}</span>
                    )}
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${kindStyles(item.kind)}`}>
                      {kindLabel(item.kind)}
                    </span>
                    <span className="ml-auto text-[0.6875rem] text-slate-500">
                      {formatDayAwareDateTimeNumeric(item.occurredAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-[0.6875rem] text-slate-500">
                    Abandoned at {stepLabel(item.step)}
                    {item.plannedTestId ? ` · Planned test ${item.plannedTestId.slice(0, 8)}…` : ''}
                  </p>
                  <p className="mt-1.5 text-[0.75rem] text-slate-700">
                    {item.reason
                      ? <><span className="font-semibold">Reason:</span> {item.reason}</>
                      : <span className="italic text-slate-500">No reason — the app was closed or backgrounded during the session.</span>}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
