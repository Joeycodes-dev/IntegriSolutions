import { WEEKDAY_LABELS, type TrendSeries } from '../../lib/reportAnalytics';

const CHART_W = 400;
const CHART_H = 160;
const PAD = { top: 14, right: 32, bottom: 24, left: 32 };

function scaleValue(value: number, max: number, height: number): number {
  if (max <= 0) return height;
  return height - (value / max) * height;
}

function buildLinePath(values: number[], max: number, plotW: number, plotH: number): string {
  if (values.length === 0) return '';
  const step = values.length > 1 ? plotW / (values.length - 1) : 0;

  return values
    .map((value, i) => {
      const x = PAD.left + i * step;
      const y = PAD.top + scaleValue(value, max, plotH);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

interface DuiTrendChartProps {
  series: TrendSeries[];
}

export function DuiTrendChart({ series }: DuiTrendChartProps) {
  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;

  const leftSeries = series.filter((s) => s.axis === 'left');
  const rightSeries = series.filter((s) => s.axis === 'right');

  const leftMax = Math.max(4, ...leftSeries.flatMap((s) => s.values), 1);
  const rightMax = Math.max(100, ...rightSeries.flatMap((s) => s.values), 1);

  const leftTicks = [0, 1, 2, 3, 4];
  const rightTicks = [40, 60, 80, 100];

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="h-full min-h-[180px] w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="DUI trends weekly chart"
    >
      {leftTicks.map((tick) => {
        const y = PAD.top + scaleValue(tick, leftMax, plotH);
        return (
          <g key={`l-${tick}`}>
            <line x1={PAD.left} y1={y} x2={CHART_W - PAD.right} y2={y} stroke="#E2E8F0" strokeWidth="1" />
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

      {WEEKDAY_LABELS.map((label, i) => {
        const x = PAD.left + (i * plotW) / (WEEKDAY_LABELS.length - 1);
        return (
          <text
            key={label}
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
          const x = PAD.left + i * step;
          const y = PAD.top + scaleValue(value, max, plotH);
          return <circle key={`${s.key}-${i}`} cx={x} cy={y} r="3" fill={s.color} />;
        });
      })}
    </svg>
  );
}

interface ResultPieChartProps {
  passed: number;
  failed: number;
}

export function ResultPieChart({ passed, failed }: ResultPieChartProps) {
  const total = passed + failed;
  const cx = 80;
  const cy = 80;
  const r = 58;

  const passAngle = total === 0 ? 180 : (passed / total) * 360;

  const polar = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const passEnd = polar(passAngle);
  const failEnd = polar(360);
  const largePass = passAngle > 180 ? 1 : 0;
  const fullCircle = `M ${cx} ${cy} m 0 -${r} a ${r} ${r} 0 1 0 0 ${r * 2} a ${r} ${r} 0 1 0 0 -${r * 2}`;

  let passPath = '';
  let failPath = fullCircle;

  if (total === 0) {
    passPath = '';
    failPath = '';
  } else if (failed === 0) {
    passPath = fullCircle;
    failPath = '';
  } else if (passed === 0) {
    passPath = '';
    failPath = fullCircle;
  } else {
    passPath = `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largePass} 1 ${passEnd.x} ${passEnd.y} Z`;
    failPath = `M ${cx} ${cy} L ${passEnd.x} ${passEnd.y} A ${r} ${r} 0 ${passAngle < 180 ? 1 : 0} 1 ${failEnd.x} ${failEnd.y} Z`;
  }

  return (
    <div className="flex w-full flex-col items-center justify-center">
      <div className="relative w-full max-w-[180px]">
        <p className="absolute left-1/2 top-1 z-10 -translate-x-1/2 text-[0.8125rem] font-bold text-slate-800">
          {passed}
        </p>
        <svg
          viewBox="0 0 160 168"
          className="mx-auto w-full"
          style={{ height: '168px' }}
          role="img"
          aria-label="Result breakdown pie chart"
        >
          {total === 0 ? (
            <path d={fullCircle} fill="#E2E8F0" />
          ) : (
            <>
              {passPath && <path d={passPath} fill="#22C55E" />}
              {failPath && <path d={failPath} fill="#EF4444" />}
            </>
          )}
        </svg>
        <p className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-[0.8125rem] font-bold text-slate-800">
          {failed}
        </p>
      </div>
      <div className="mt-1 flex items-center justify-center gap-5">
        <span className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-slate-600">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          Passed
        </span>
        <span className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-slate-600">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
          Failed
        </span>
      </div>
    </div>
  );
}
