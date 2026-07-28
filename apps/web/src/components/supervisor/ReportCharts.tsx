import { niceTicks, type TrendSeries } from '../../lib/reportAnalytics';

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

  const passAngle = total === 0 ? 0 : (passed / total) * 360;
  const failAngle = total === 0 ? 0 : (failed / total) * 360;

  const passEnd = polar(cx, cy, r, passAngle);
  const failEnd = polar(cx, cy, r, 360);
  const largePass = passAngle > 180 ? 1 : 0;
  const largeFail = failAngle > 180 ? 1 : 0;
  const fullCircle = `M ${cx} ${cy} m 0 -${r} a ${r} ${r} 0 1 0 0 ${r * 2} a ${r} ${r} 0 1 0 0 -${r * 2}`;

  let passPath = '';
  let failPath = '';

  if (total === 0) {
    passPath = '';
    failPath = '';
  } else if (failed === 0) {
    passPath = fullCircle;
  } else if (passed === 0) {
    failPath = fullCircle;
  } else {
    passPath = `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largePass} 1 ${passEnd.x} ${passEnd.y} Z`;
    failPath = `M ${cx} ${cy} L ${passEnd.x} ${passEnd.y} A ${r} ${r} 0 ${largeFail} 1 ${failEnd.x} ${failEnd.y} Z`;
  }

  const passMid = polar(cx, cy, r * 0.55, passAngle / 2);
  const failMid = polar(cx, cy, r * 0.55, passAngle + failAngle / 2);
  const showPassLabel = passed > 0 && passed / Math.max(total, 1) >= 0.08;
  const showFailLabel = failed > 0 && failed / Math.max(total, 1) >= 0.08;

  return (
    <div className="flex w-full flex-col items-center justify-center">
      <svg
        viewBox="0 0 160 160"
        className="mx-auto w-full max-w-[180px]"
        style={{ height: '160px' }}
        role="img"
        aria-label={`Result breakdown: ${passed} passed, ${failed} failed`}
      >
        {total === 0 ? (
          <path d={fullCircle} fill="#E2E8F0" />
        ) : (
          <>
            {passPath && <path d={passPath} fill="#22C55E" />}
            {failPath && <path d={failPath} fill="#EF4444" />}
            {showPassLabel && (
              <text
                x={passMid.x}
                y={passMid.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-white text-[11px] font-bold"
              >
                {passed}
              </text>
            )}
            {showFailLabel && (
              <text
                x={failMid.x}
                y={failMid.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-white text-[11px] font-bold"
              >
                {failed}
              </text>
            )}
          </>
        )}
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
