import { formatEvidenceTimestamp } from '../../lib/testEvidence';
import { niceTicks, type RoadblockStat, type TrendSeries } from '../../lib/reportAnalytics';

const CHART_W = 400;
const CHART_H = 180;
const PAD = { top: 14, right: 36, bottom: 28, left: 32 };

function scaleValue(value: number, max: number, height: number): number {
  if (max <= 0) return height;
  return height - (value / max) * height;
}

function buildLinePath(values: number[], max: number, plotW: number, plotH: number): string {
  if (values.length === 0) return '';
  const step = values.length > 1 ? plotW / (values.length - 1) : 0;

  return values
    .map((value, i) => {
      const x = values.length === 1 ? PAD.left + plotW / 2 : PAD.left + i * step;
      const y = PAD.top + scaleValue(value, max, plotH);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

interface DuiTrendChartProps {
  series: TrendSeries[];
  labels: string[];
}

export function DuiTrendChart({ series, labels }: DuiTrendChartProps) {
  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;

  const leftSeries = series.filter((s) => s.axis === 'left');
  const leftPeak = Math.max(0, ...leftSeries.flatMap((s) => s.values));
  const leftTicks = niceTicks(Math.max(leftPeak, 1), 5);
  const leftMax = leftTicks[leftTicks.length - 1] ?? 1;

  const rightTicks = [0, 25, 50, 75, 100];
  const rightMax = 100;

  const xLabels = labels.length > 0 ? labels : series[0]?.values.map((_, i) => String(i + 1)) ?? [];
  const labelStep =
    xLabels.length > 10 ? Math.ceil(xLabels.length / 8) : xLabels.length > 7 ? 2 : 1;

  return (
    <div className="flex w-full flex-col gap-2">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-full min-h-[180px] w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="DUI trends chart"
      >
        {leftTicks.map((tick) => {
          const y = PAD.top + scaleValue(tick, leftMax, plotH);
          return (
            <g key={`l-${tick}`}>
              <line
                x1={PAD.left}
                y1={y}
                x2={CHART_W - PAD.right}
                y2={y}
                stroke="#E2E8F0"
                strokeWidth="1"
              />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" className="fill-slate-400 text-[8px]">
                {tick}
              </text>
            </g>
          );
        })}

        {rightTicks.map((tick) => {
          const y = PAD.top + scaleValue(tick, rightMax, plotH);
          return (
            <text
              key={`r-${tick}`}
              x={CHART_W - PAD.right + 6}
              y={y + 3}
              textAnchor="start"
              className="fill-slate-400 text-[8px]"
            >
              {tick}
            </text>
          );
        })}

        {xLabels.map((label, i) => {
          if (i % labelStep !== 0 && i !== xLabels.length - 1) return null;
          const x =
            xLabels.length === 1
              ? PAD.left + plotW / 2
              : PAD.left + (i * plotW) / (xLabels.length - 1);
          return (
            <text
              key={`${label}-${i}`}
              x={x}
              y={CHART_H - 8}
              textAnchor="middle"
              className="fill-slate-500 text-[8px] font-medium"
            >
              {label}
            </text>
          );
        })}

        {series.map((s) => {
          const max = s.axis === 'left' ? leftMax : rightMax;
          const path = buildLinePath(s.values, max, plotW, plotH);
          if (!path) return null;
          return (
            <path
              key={s.key}
              d={path}
              fill="none"
              stroke={s.color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {series.map((s) => {
          const max = s.axis === 'left' ? leftMax : rightMax;
          const step = s.values.length > 1 ? plotW / (s.values.length - 1) : 0;
          return s.values.map((value, i) => {
            const x = s.values.length === 1 ? PAD.left + plotW / 2 : PAD.left + i * step;
            const y = PAD.top + scaleValue(value, max, plotH);
            return <circle key={`${s.key}-${i}`} cx={x} cy={y} r="3" fill={s.color} />;
          });
        })}
      </svg>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-slate-600">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

interface ResultPieChartProps {
  passed: number;
  failed: number;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function ResultPieChart({ passed, failed }: ResultPieChartProps) {
  const total = passed + failed;
  const cx = 80;
  const cy = 80;
  const r = 58;
  const inner = 38;

  const passAngle = total === 0 ? 0 : (passed / total) * 360;

  const passEnd = polar(cx, cy, r, passAngle);
  const passInner = polar(cx, cy, inner, passAngle);
  const largePass = passAngle > 180 ? 1 : 0;
  const largeFail = 360 - passAngle > 180 ? 1 : 0;
  const failInnerStart = polar(cx, cy, inner, 360);
  const failEnd = polar(cx, cy, r, 360);

  const ringPath = (outerR: number, innerR: number) =>
    `M ${cx} ${cy - outerR} a ${outerR} ${outerR} 0 1 0 0 ${outerR * 2} a ${outerR} ${outerR} 0 1 0 0 -${outerR * 2} ` +
    `M ${cx} ${cy - innerR} a ${innerR} ${innerR} 0 1 1 0 ${innerR * 2} a ${innerR} ${innerR} 0 1 1 0 -${innerR * 2}`;

  let passPath = '';
  let failPath = '';

  if (total > 0 && failed === 0) {
    passPath = ringPath(r, inner);
  } else if (total > 0 && passed === 0) {
    failPath = ringPath(r, inner);
  } else if (total > 0) {
    passPath =
      `M ${cx} ${cy - r} A ${r} ${r} 0 ${largePass} 1 ${passEnd.x} ${passEnd.y} ` +
      `L ${passInner.x} ${passInner.y} A ${inner} ${inner} 0 ${largePass} 0 ${cx} ${cy - inner} Z`;
    failPath =
      `M ${passEnd.x} ${passEnd.y} A ${r} ${r} 0 ${largeFail} 1 ${failEnd.x} ${failEnd.y} ` +
      `L ${failInnerStart.x} ${failInnerStart.y} A ${inner} ${inner} 0 ${largeFail} 0 ${passInner.x} ${passInner.y} Z`;
  }

  const failRate = total === 0 ? 0 : Math.round((failed / total) * 100);

  return (
    <div className="flex w-full flex-col items-center justify-center">
      <svg
        viewBox="0 0 160 160"
        className="mx-auto w-full max-w-[180px]"
        style={{ height: '160px' }}
        role="img"
        aria-label={`Result breakdown: ${passed} passed, ${failed} failed, failure rate ${failRate} percent`}
      >
        {total === 0 ? (
          <path d={ringPath(r, inner)} fill="#E2E8F0" fillRule="evenodd" />
        ) : (
          <>
            {passPath && <path d={passPath} fill="#22C55E" fillRule="evenodd" />}
            {failPath && <path d={failPath} fill="#EF4444" fillRule="evenodd" />}
          </>
        )}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-slate-900 text-[22px] font-bold tabular-nums"
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-slate-500 text-[8px] font-semibold tracking-wide"
        >
          TOTAL TESTS
        </text>
        <text
          x={cx}
          y={cy + 22}
          textAnchor="middle"
          dominantBaseline="central"
          className={`text-[8px] font-bold ${total === 0 ? 'fill-slate-400' : 'fill-rose-600'}`}
        >
          {total === 0 ? '—' : `${failRate}% FAILED`}
        </text>
      </svg>
      <div className="mt-2 flex items-center justify-center gap-5">
        <span className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-slate-600">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          Passed ({passed})
        </span>
        <span className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-slate-600">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
          Failed ({failed})
        </span>
      </div>
      {total === 0 && (
        <p className="mt-1 text-[0.6875rem] text-slate-400">No results in this range</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Additional report visualisations                                    */
/* ------------------------------------------------------------------ */

interface RoadblockBarChartProps {
  stats: RoadblockStat[];
  maxRows?: number;
}

/** Horizontal ranked bars — value labels always visible (not hover-only). */
export function RoadblockBarChart({ stats, maxRows = 6 }: RoadblockBarChartProps) {
  const rows = stats.slice(0, maxRows);
  if (rows.length === 0) {
    return <p className="w-full py-8 text-center text-[0.75rem] text-slate-400">No roadblock data in this range</p>;
  }
  const maxFailed = Math.max(1, ...rows.map((r) => r.failed));

  return (
    <div className="flex w-full flex-col gap-2" role="img" aria-label="Failures by roadblock bar chart">
      {rows.map((row) => {
        const widthPct = Math.max(row.failed > 0 ? 4 : 0, (row.failed / maxFailed) * 100);
        return (
          <div key={row.key} className="flex items-center gap-2">
            <span className="w-[7.5rem] shrink-0 truncate text-right text-[0.6875rem] font-medium text-slate-600" title={row.name}>
              {row.name}
            </span>
            <div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-slate-100">
              <div
                className="flex h-full items-center rounded-md bg-rose-500/90 pl-1.5 transition-all duration-300"
                style={{ width: `${widthPct}%` }}
                title={`${row.name}: ${row.failed} failed of ${row.total} tests (${row.failureRate}%)${row.roadblockId ? `, ID ${row.roadblockId}` : ''}`}
              >
                {row.failed > 0 && (
                  <span className="text-[0.625rem] font-bold text-white tabular-nums">{row.failed}</span>
                )}
              </div>
            </div>
            <span className="w-[4.5rem] shrink-0 text-[0.625rem] font-semibold text-slate-500 tabular-nums">
              {row.failed}/{row.total} · {row.failureRate}%
            </span>
          </div>
        );
      })}
      <p className="mt-1 text-[0.625rem] text-slate-400">
        Failed / total tests and failure rate per checkpoint, ranked by failures.
      </p>
    </div>
  );
}

function formatRoadblockWindow(row: RoadblockStat): string {
  if (!row.shiftStartsAt || !row.shiftEndsAt) return 'Not recorded';
  return `${formatEvidenceTimestamp(row.shiftStartsAt)} - ${formatEvidenceTimestamp(row.shiftEndsAt)}`;
}

export function RoadblockPerformanceTable({ stats }: { stats: RoadblockStat[] }) {
  if (stats.length === 0) {
    return <p className="py-8 text-center text-[0.75rem] text-slate-400">No roadblock data in this range</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[850px] w-full text-left" aria-label="Roadblock accountability report">
        <thead>
          <tr className="border-b" style={{ borderColor: '#E2E8F0' }}>
            {['ROADBLOCK / ID', 'STATION / SUPERVISOR', 'TESTS', 'FAILURES', 'FAILURE RATE', 'OFFICERS', 'AVG BAC', 'SHIFT WINDOW'].map((column) => (
              <th key={column} className="px-3 py-2 text-[9px] font-bold tracking-[0.1em] text-slate-500">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.map((row) => (
            <tr key={row.key} className="border-b last:border-b-0" style={{ borderColor: '#E2E8F0' }}>
              <td className="max-w-[190px] px-3 py-2.5">
                <p className="truncate text-[0.75rem] font-bold text-slate-800" title={row.name}>{row.name}</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500" title={row.roadblockId ?? undefined}>
                  {row.roadblockId ?? 'No shift ID'}
                </p>
              </td>
              <td className="max-w-[180px] px-3 py-2.5">
                <p className="truncate text-[0.75rem] font-semibold text-slate-700">{row.station}</p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500" title={row.supervisor}>
                  Supervisor: {row.supervisor}
                </p>
              </td>
              <td className="px-3 py-2.5">
                <p className="text-[0.8125rem] font-bold tabular-nums text-slate-800">{row.total}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{row.passed} passed</p>
              </td>
              <td className="px-3 py-2.5">
                <p className="text-[0.8125rem] font-bold tabular-nums text-rose-600">{row.failed}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">of {row.total}</p>
              </td>
              <td className="px-3 py-2.5">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${row.failureRate > 50 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  {row.failureRate}%
                </span>
              </td>
              <td className="px-3 py-2.5 text-[0.75rem] font-semibold tabular-nums text-slate-700">{row.officerCount}</td>
              <td className="px-3 py-2.5 font-mono text-[0.75rem] text-slate-700">{row.averageBac.toFixed(3)}</td>
              <td className="max-w-[210px] px-3 py-2.5 text-[10px] leading-snug text-slate-600">{formatRoadblockWindow(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface BacHistogramProps {
  buckets: { label: string; min: number; count: number; failed: number }[];
}

/** BAC distribution with SA legal-limit markers (0.02 professional, 0.05 general). */
export function BacHistogram({ buckets }: BacHistogramProps) {
  const W = 400;
  const H = 170;
  const pad = { top: 18, right: 8, bottom: 30, left: 26 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const ticks = niceTicks(max, 4);
  const axisMax = ticks[ticks.length - 1] ?? 1;
  const barW = plotW / Math.max(buckets.length, 1);

  const limitX = (bac: number) => pad.left + (bac / 0.15) * plotW;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-full min-h-[170px] w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="BAC reading distribution histogram with legal limit markers at 0.02 and 0.05 grams per 100 millilitres"
      >
        {ticks.map((tick) => {
          const y = pad.top + scaleValue(tick, axisMax, plotH);
          return (
            <g key={`t-${tick}`}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#E2E8F0" strokeWidth="1" />
              <text x={pad.left - 5} y={y + 3} textAnchor="end" className="fill-slate-400 text-[8px]">
                {tick}
              </text>
            </g>
          );
        })}

        {buckets.map((bucket, i) => {
          const h = (bucket.count / axisMax) * plotH;
          const failH = (bucket.failed / axisMax) * plotH;
          const x = pad.left + i * barW + 3;
          const w = Math.max(barW - 6, 4);
          return (
            <g key={bucket.label}>
              <rect x={x} y={pad.top + plotH - h} width={w} height={Math.max(h, 0)} rx="2" fill="#CBD5E1">
                <title>{`${bucket.label} g/100ml: ${bucket.count} tests, ${bucket.failed} failed`}</title>
              </rect>
              {bucket.failed > 0 && (
                <rect x={x} y={pad.top + plotH - failH} width={w} height={failH} rx="2" fill="#EF4444">
                  <title>{`${bucket.failed} failed in ${bucket.label}`}</title>
                </rect>
              )}
              {bucket.count > 0 && (
                <text
                  x={x + w / 2}
                  y={pad.top + plotH - h - 4}
                  textAnchor="middle"
                  className="fill-slate-600 text-[8px] font-bold tabular-nums"
                >
                  {bucket.count}
                </text>
              )}
              <text
                x={x + w / 2}
                y={H - 16}
                textAnchor="middle"
                className="fill-slate-500 text-[7px] font-medium"
              >
                {bucket.label}
              </text>
            </g>
          );
        })}

        {/* Legal limit markers */}
        <line x1={limitX(0.02)} y1={pad.top} x2={limitX(0.02)} y2={pad.top + plotH} stroke="#D97706" strokeWidth="1.5" strokeDasharray="4 3" />
        <line x1={limitX(0.05)} y1={pad.top} x2={limitX(0.05)} y2={pad.top + plotH} stroke="#DC2626" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x={limitX(0.02)} y={pad.top - 8} textAnchor="middle" className="fill-amber-700 text-[7px] font-bold">
          0.02 PROF
        </text>
        <text x={limitX(0.05)} y={pad.top - 8} textAnchor="middle" className="fill-rose-700 text-[7px] font-bold">
          0.05 GEN
        </text>
      </svg>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-slate-600">
          <span className="h-2 w-2 rounded-sm bg-slate-300" /> All tests
        </span>
        <span className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-slate-600">
          <span className="h-2 w-2 rounded-sm bg-rose-500" /> Failed
        </span>
        <span className="text-[0.625rem] text-slate-400">g/100ml buckets</span>
      </div>
    </div>
  );
}

interface PeakHoursHeatmapProps {
  data: { fails: number[][]; totals: number[][]; maxFail: number };
}

const HEAT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function heatColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return '#F1F5F9';
  const t = Math.min(1, value / max);
  // slate-200 → rose-500 ramp
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(254, 239)}, ${lerp(226, 68)}, ${lerp(226, 68)})`;
}

/** 7-day x 24-hour failure intensity grid with numeric legend + tooltips. */
export function PeakHoursHeatmap({ data }: PeakHoursHeatmapProps) {
  const W = 400;
  const H = 148;
  const pad = { top: 6, right: 6, bottom: 18, left: 30 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const cellW = plotW / 24;
  const cellH = plotH / 7;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-full min-h-[148px] w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Heatmap of failed tests by day of week and hour of day"
      >
        {HEAT_DAYS.map((day, row) => (
          <text
            key={day}
            x={pad.left - 5}
            y={pad.top + row * cellH + cellH / 2 + 2.5}
            textAnchor="end"
            className="fill-slate-500 text-[7px] font-semibold"
          >
            {day}
          </text>
        ))}

        {data.fails.map((rowFails, row) =>
          rowFails.map((fails, hour) => (
            <rect
              key={`${row}-${hour}`}
              x={pad.left + hour * cellW + 0.5}
              y={pad.top + row * cellH + 0.5}
              width={Math.max(cellW - 1, 1)}
              height={Math.max(cellH - 1, 1)}
              rx="1.5"
              fill={heatColor(fails, data.maxFail)}
            >
              <title>{`${HEAT_DAYS[row]} ${String(hour).padStart(2, '0')}:00 — ${fails} failed, ${data.totals[row][hour]} total`}</title>
            </rect>
          ))
        )}

        {[0, 6, 12, 18, 23].map((hour) => (
          <text
            key={hour}
            x={pad.left + hour * cellW + cellW / 2}
            y={H - 6}
            textAnchor="middle"
            className="fill-slate-400 text-[7px] font-medium"
          >
            {`${String(hour).padStart(2, '0')}:00`}
          </text>
        ))}
      </svg>

      <div className="flex items-center justify-center gap-2 text-[0.625rem] text-slate-500">
        <span>0</span>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <span
            key={t}
            className="h-2.5 w-5 rounded-sm border border-slate-200"
            style={{ backgroundColor: heatColor(t * Math.max(data.maxFail, 1), Math.max(data.maxFail, 1)) }}
          />
        ))}
        <span>{data.maxFail} failed tests / hour</span>
      </div>
    </div>
  );
}

interface OfficerLeaderboardProps {
  officers: { name: string; badge: string; total: number; failed: number; failureRate: number }[];
  maxRows?: number;
}

export function OfficerLeaderboard({ officers, maxRows = 5 }: OfficerLeaderboardProps) {
  const rows = officers.slice(0, maxRows);
  if (rows.length === 0) {
    return <p className="w-full py-8 text-center text-[0.75rem] text-slate-400">No officer activity in this range</p>;
  }
  const maxTotal = Math.max(1, ...rows.map((o) => o.total));

  return (
    <ol className="flex w-full flex-col divide-y divide-slate-100" aria-label="Officer activity leaderboard">
      {rows.map((officer, i) => (
        <li key={`${officer.name}-${officer.badge}`} className="flex items-center gap-2.5 py-2">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold tabular-nums ${
              i === 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
            }`}
            aria-label={`Rank ${i + 1}`}
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-[0.75rem] font-semibold text-slate-800" title={officer.name}>
                {officer.name}
              </p>
              <p className="shrink-0 text-[0.6875rem] font-bold text-slate-700 tabular-nums">
                {officer.total} tests
              </p>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#0D2137]/80 transition-all duration-300"
                  style={{ width: `${(officer.total / maxTotal) * 100}%` }}
                />
              </div>
              <span className={`shrink-0 text-[0.625rem] font-semibold tabular-nums ${officer.failureRate > 50 ? 'text-rose-600' : 'text-slate-500'}`}>
                {officer.failed} fail · {officer.failureRate}%
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
