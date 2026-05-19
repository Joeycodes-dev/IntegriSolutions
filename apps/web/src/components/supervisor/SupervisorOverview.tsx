import { Activity, AlertTriangle, ShieldAlert, Users } from 'lucide-react';
import {
  BORDER,
  NAVY,
  PAGE_BG,
  pageContent,
  pageHeader,
  pageShell,
  pageSubtitle,
  pageTitle
} from './supervisorStyles';

const MAP_EMBED =
  'https://www.openstreetmap.org/export/embed.html?bbox=27.9200%2C-26.3200%2C28.0800%2C-26.1200&layer=mapnik';

interface SupervisorOverviewProps {
  metrics: {
    totalTests: number;
    totalFailures: number;
    activeOfficers: number;
    invalidTests: number;
  };
  loading: boolean;
  error: string | null;
}

const METRIC_CARDS = [
  {
    key: 'totalTests' as const,
    label: 'TOTAL TESTS',
    icon: Activity,
    iconBg: '#DBEAFE',
    iconColor: '#2563EB'
  },
  {
    key: 'totalFailures' as const,
    label: 'TOTAL FAILURES',
    icon: ShieldAlert,
    iconBg: '#FEE2E2',
    iconColor: '#DC2626'
  },
  {
    key: 'activeOfficers' as const,
    label: 'ACTIVE OFFICERS',
    icon: Users,
    iconBg: '#EDE9FE',
    iconColor: '#7C3AED'
  },
  {
    key: 'invalidTests' as const,
    label: 'INVALID TESTS',
    icon: AlertTriangle,
    iconBg: '#FFEDD5',
    iconColor: '#EA580C'
  }
];

function MetricCard({
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor
}: {
  label: string;
  value: string | number;
  icon: typeof Activity;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div
      className="flex h-[4.25rem] min-w-0 items-center justify-between rounded-xl border bg-white px-3.5"
      style={{ borderColor: BORDER }}
    >
      <div className="flex min-w-0 flex-col justify-center">
        <p className="truncate text-[9px] font-bold leading-none tracking-[0.14em] text-slate-500">
          {label}
        </p>
        <p
          className="mt-1.5 text-[1.25rem] font-bold leading-none tabular-nums"
          style={{ color: NAVY }}
        >
          {value}
        </p>
      </div>
      <div
        className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: iconBg }}
      >
        <Icon size={16} strokeWidth={2} style={{ color: iconColor }} />
      </div>
    </div>
  );
}

export function SupervisorOverview({ metrics, loading, error }: SupervisorOverviewProps) {
  return (
    <div className={pageShell} style={{ backgroundColor: PAGE_BG }}>
      <header className={`${pageHeader} flex flex-wrap items-start justify-between gap-3`}>
        <div>
          <h1 className={pageTitle} style={{ color: NAVY }}>
            Overview Dashboard
          </h1>
          <p className={pageSubtitle}>Today&apos;s enforcement activity at a glance</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
          <span className="text-[0.6875rem] font-semibold text-emerald-800">Live sync active</span>
        </div>
      </header>

      <div className={`${pageContent} space-y-3`}>
        {error && (
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-4 gap-2.5">
          {METRIC_CARDS.map(({ key, label, icon, iconBg, iconColor }) => (
            <MetricCard
              key={key}
              label={label}
              value={loading ? '—' : metrics[key]}
              icon={icon}
              iconBg={iconBg}
              iconColor={iconColor}
            />
          ))}
        </div>

        <section className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: BORDER }}>
          <div className="border-b px-4 py-2.5" style={{ borderColor: BORDER }}>
            <h2 className="text-[0.8125rem] font-bold leading-tight" style={{ color: NAVY }}>
              Hotspot Map
            </h2>
            <p className="mt-0.5 text-[0.75rem] leading-snug text-slate-500">
              Live test concentration across Johannesburg precincts
            </p>
          </div>
          <div className="p-3">
            <div className="overflow-hidden rounded-lg border" style={{ borderColor: BORDER }}>
              <iframe
                title="Johannesburg enforcement hotspot map"
                src={MAP_EMBED}
                className="h-[200px] w-full border-0 lg:h-[240px]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
