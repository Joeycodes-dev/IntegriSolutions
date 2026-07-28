import { Activity, AlertTriangle, ShieldAlert, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TestRecord } from '../../types';
import { parseTestLocation } from '../../lib/testEvidence';
import 'leaflet/dist/leaflet.css';
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

const DEFAULT_MAP_CENTER: [number, number] = [-26.2041, 28.0473];

interface SupervisorOverviewProps {
  metrics: {
    totalTests: number;
    totalFailures: number;
    activeOfficers: number;
    invalidTests: number;
  };
  loading: boolean;
  error: string | null;
  streamConnected: boolean;
  lastEventAt: string | null;
  tests: TestRecord[];
}

interface HotspotPoint {
  key: string;
  lat: number;
  lng: number;
  count: number;
  result: 'pass' | 'fail';
}

interface TestPin {
  key: string;
  groupKey: string;
  lat: number;
  lng: number;
  result: 'pass' | 'fail';
  testId: string;
  createdAt: string;
}

type DateFilterMode = 'day' | 'range';

function formatCoord(value: number): string {
  return value.toFixed(4);
}

function formatLastEvent(value: string | null): string {
  if (!value) return 'No events yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No events yet';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

export function SupervisorOverview({ metrics, loading, error, streamConnected, lastEventAt, tests }: SupervisorOverviewProps) {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [dateMode, setDateMode] = useState<DateFilterMode>('day');
  const [selectedDay, setSelectedDay] = useState(todayIso);
  const [dateFrom, setDateFrom] = useState(todayIso);
  const [dateTo, setDateTo] = useState(todayIso);

  const filteredTests = useMemo(() => {
    const startOfDay = (value: string): number => new Date(`${value}T00:00:00`).getTime();
    const endOfDay = (value: string): number => new Date(`${value}T23:59:59.999`).getTime();

    if (dateMode === 'day') {
      const start = startOfDay(selectedDay);
      const end = endOfDay(selectedDay);
      return tests.filter((test) => {
        const t = new Date(test.createdAt).getTime();
        return Number.isFinite(t) && t >= start && t <= end;
      });
    }

    const start = startOfDay(dateFrom);
    const end = endOfDay(dateTo);
    return tests.filter((test) => {
      const t = new Date(test.createdAt).getTime();
      return Number.isFinite(t) && t >= start && t <= end;
    });
  }, [tests, dateMode, selectedDay, dateFrom, dateTo]);

  const hotspots = useMemo<HotspotPoint[]>(() => {
    const counts = new Map<string, HotspotPoint>();

    for (const test of filteredTests) {
      const parsed = parseTestLocation(test.location);
      if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') continue;
      const result = test.result === 'fail' ? 'fail' : 'pass';

      const lat = Number(parsed.lat.toFixed(4));
      const lng = Number(parsed.lng.toFixed(4));
      const key = `${lat},${lng},${result}`;

      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, {
          key,
          lat,
          lng,
          count: 1,
          result
        });
      }
    }

    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [filteredTests]);

  const testPins = useMemo<TestPin[]>(() => {
    const grouped = new Map<string, Array<{ id: string; createdAt: string; lat: number; lng: number; result: 'pass' | 'fail'; groupKey: string }>>();

    for (const test of filteredTests) {
      const parsed = parseTestLocation(test.location);
      if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') continue;

      const lat = Number(parsed.lat.toFixed(4));
      const lng = Number(parsed.lng.toFixed(4));
      const result: 'pass' | 'fail' = test.result === 'fail' ? 'fail' : 'pass';
      const groupKey = `${lat},${lng},${result}`;

      const bucket = grouped.get(groupKey) ?? [];
      bucket.push({
        id: test.id,
        createdAt: test.createdAt,
        lat,
        lng,
        result,
        groupKey
      });
      grouped.set(groupKey, bucket);
    }

    const pins: TestPin[] = [];
    for (const bucket of grouped.values()) {
      const total = bucket.length;
      bucket.forEach((item, index) => {
        const angle = (2 * Math.PI * index) / Math.max(1, total);
        const ring = Math.floor(index / 8);
        const radius = total <= 1 ? 0 : 0.00015 * (ring + 1);
        const offsetLat = item.lat + radius * Math.sin(angle);
        const offsetLng = item.lng + radius * Math.cos(angle);

        pins.push({
          key: `${item.id}-${index}`,
          groupKey: item.groupKey,
          lat: offsetLat,
          lng: offsetLng,
          result: item.result,
          testId: item.id,
          createdAt: item.createdAt
        });
      });
    }

    return pins;
  }, [filteredTests]);

  const passFailTotals = useMemo(() => {
    let passed = 0;
    let failed = 0;
    for (const test of filteredTests) {
      if (test.result === 'fail') failed += 1;
      else passed += 1;
    }
    return { passed, failed };
  }, [filteredTests]);

  const [selectedHotspotKey, setSelectedHotspotKey] = useState<string | null>(null);

  const selectedHotspot = useMemo(() => {
    if (!selectedHotspotKey) return null;
    return hotspots.find((p) => p.key === selectedHotspotKey) ?? null;
  }, [hotspots, selectedHotspotKey]);

  const visiblePins = useMemo(() => {
    if (!selectedHotspotKey || !selectedHotspot) return testPins;
    return testPins.filter((pin) => pin.result === selectedHotspot.result);
  }, [testPins, selectedHotspot, selectedHotspotKey]);

  const mapCenter: [number, number] = selectedHotspot
    ? [selectedHotspot.lat, selectedHotspot.lng]
    : testPins[0]
      ? [testPins[0].lat, testPins[0].lng]
      : DEFAULT_MAP_CENTER;

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const renderMap = async () => {
      try {
        const L = await import('leaflet');
        if (cancelled || !mapContainerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = L.map(mapContainerRef.current, { zoomControl: true }).setView(mapCenter, 12);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(mapRef.current);
          markerLayerRef.current = L.layerGroup().addTo(mapRef.current);
        } else {
          mapRef.current.setView(mapCenter, mapRef.current.getZoom() || 12);
        }

        const greenIcon = L.icon({
          iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41]
        });

        const redIcon = L.icon({
          iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41]
        });

        if (markerLayerRef.current) {
          markerLayerRef.current.clearLayers();
        }

        for (const pin of visiblePins) {
          const marker = L.marker([pin.lat, pin.lng], {
            icon: pin.result === 'fail' ? redIcon : greenIcon
          });
          marker.bindPopup(
            `<div style="font-size:12px;"><strong>${pin.result === 'fail' ? 'FAILED' : 'PASSED'}</strong><br/>Test: ${pin.testId}<br/>${new Date(pin.createdAt).toLocaleString()}<br/>${formatCoord(pin.lat)}, ${formatCoord(pin.lng)}</div>`
          );
          marker.on('click', () => setSelectedHotspotKey(pin.groupKey));
          marker.addTo(markerLayerRef.current);
        }

        setMapError(null);
      } catch (err) {
        console.error('Hotspot map failed:', err);
        setMapError('Map failed to load. Refresh page to retry.');
      }
    };

    void renderMap();

    return () => {
      cancelled = true;
    };
  }, [visiblePins, mapCenter]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
      }
    };
  }, []);

  return (
    <div className={pageShell} style={{ backgroundColor: PAGE_BG }}>
      <header className={`${pageHeader} flex flex-wrap items-start justify-between gap-3`}>
        <div>
          <h1 className={pageTitle} style={{ color: NAVY }}>
            Overview Dashboard
          </h1>
          <p className={pageSubtitle}>Today&apos;s enforcement activity at a glance</p>
        </div>
        <div
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 ${
            streamConnected ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${streamConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}
            aria-hidden
          />
          <span className={`text-[0.6875rem] font-semibold ${streamConnected ? 'text-emerald-800' : 'text-rose-800'}`}>
            {streamConnected ? 'Live sync connected' : 'Live sync disconnected'}
          </span>
        </div>
        <div className="text-[0.6875rem] font-semibold text-slate-500">
          Last event: <span className="text-slate-700">{formatLastEvent(lastEventAt)}</span>
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
            <div className="mb-2.5 flex flex-wrap items-end gap-3 rounded-lg border bg-slate-50 p-2.5" style={{ borderColor: BORDER }}>
              <label className="flex items-center gap-2 text-[0.75rem] font-semibold text-slate-700">
                <input
                  type="radio"
                  name="date-mode"
                  value="day"
                  checked={dateMode === 'day'}
                  onChange={() => setDateMode('day')}
                />
                Single day
              </label>
              <label className="flex items-center gap-2 text-[0.75rem] font-semibold text-slate-700">
                <input
                  type="radio"
                  name="date-mode"
                  value="range"
                  checked={dateMode === 'range'}
                  onChange={() => setDateMode('range')}
                />
                Date range
              </label>

              {dateMode === 'day' ? (
                <label className="flex flex-col gap-1 text-[0.6875rem] font-semibold text-slate-600">
                  Day
                  <input
                    type="date"
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(e.target.value)}
                    className="h-[30px] rounded-md border bg-white px-2 text-[0.75rem] text-slate-800"
                    style={{ borderColor: BORDER }}
                  />
                </label>
              ) : (
                <>
                  <label className="flex flex-col gap-1 text-[0.6875rem] font-semibold text-slate-600">
                    From
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-[30px] rounded-md border bg-white px-2 text-[0.75rem] text-slate-800"
                      style={{ borderColor: BORDER }}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[0.6875rem] font-semibold text-slate-600">
                    To
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-[30px] rounded-md border bg-white px-2 text-[0.75rem] text-slate-800"
                      style={{ borderColor: BORDER }}
                    />
                  </label>
                </>
              )}
            </div>

            <div className="mb-2 flex items-center gap-4 text-[0.75rem] font-semibold text-slate-700">
              <span>Passed: <span className="text-emerald-700">{passFailTotals.passed}</span></span>
              <span>Failed: <span className="text-rose-700">{passFailTotals.failed}</span></span>
            </div>

            <div className="overflow-hidden rounded-lg border" style={{ borderColor: BORDER }}>
              {mapError ? (
                <div className="flex h-[200px] items-center justify-center bg-slate-50 text-center text-[0.75rem] text-slate-600 lg:h-[240px]">
                  {mapError}
                </div>
              ) : (
                <div ref={mapContainerRef} className="h-[200px] w-full lg:h-[240px]" />
              )}
            </div>

            {selectedHotspotKey && selectedHotspot ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-[0.75rem] text-slate-600">
                  Selected pin: {formatCoord(selectedHotspot.lat)}, {formatCoord(selectedHotspot.lng)} · {selectedHotspot.result === 'fail' ? 'Failed' : 'Passed'} {selectedHotspot.count} · Showing only {selectedHotspot.result === 'fail' ? 'failed' : 'passed'} pins on map
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedHotspotKey(null)}
                  className="rounded-md border px-2 py-1 text-[0.6875rem] font-semibold text-slate-700 transition hover:bg-slate-50"
                  style={{ borderColor: BORDER }}
                >
                  Show all pins
                </button>
              </div>
            ) : null}

            {hotspots.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {hotspots.slice(0, 10).map((spot) => {
                  const active = selectedHotspot?.key === spot.key;
                  return (
                    <button
                      key={spot.key}
                      type="button"
                      onClick={() => setSelectedHotspotKey(spot.key)}
                      className={`rounded-full border px-2 py-1 text-[0.6875rem] font-semibold transition ${
                        active
                          ? 'border-[#0D2137]/35 bg-[#0D2137]/8 text-[#0D2137]'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                      style={{ borderColor: active ? undefined : BORDER }}
                    >
                      {spot.result === 'fail' ? 'FAIL' : 'PASS'} · {formatCoord(spot.lat)}, {formatCoord(spot.lng)} ({spot.count})
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-[0.75rem] text-slate-500">
                No GPS coordinates available for the selected date filter.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
