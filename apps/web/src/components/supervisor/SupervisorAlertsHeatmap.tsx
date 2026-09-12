import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { AlertSighting } from '../../types';
import { HEATMAP_DISCLAIMER, buildHeatmapCells } from '../../lib/alertSightings';
import { BORDER } from './supervisorStyles';

const DEFAULT_MAP_CENTER: [number, number] = [-26.2041, 28.0473];

function intensityColor(ratio: number): string {
  if (ratio >= 0.75) return '#b91c1c';
  if (ratio >= 0.5) return '#ea580c';
  if (ratio >= 0.25) return '#f59e0b';
  return '#facc15';
}

interface Props {
  sightings: AlertSighting[];
}

/**
 * Aggregate density view of reported sightings, built with the same
 * grid-bucketing technique already used for the DUI-test hotspot map in
 * SupervisorOverview.tsx (round coordinates, count per cell, size/color by
 * count) — no heatmap library dependency added. Deliberately a density-of-
 * reports view, not a predictive model: it never infers where a person or
 * vehicle is likely to be.
 */
export function SupervisorAlertsHeatmap({ sightings }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const cellLayerRef = useRef<any>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const cells = buildHeatmapCells(sightings);
  const maxCount = cells.reduce((max, cell) => Math.max(max, cell.count), 0);
  const mapCenter: [number, number] = cells[0] ? [cells[0].lat, cells[0].lng] : DEFAULT_MAP_CENTER;

  useEffect(() => {
    let cancelled = false;

    const renderHeatmap = async () => {
      try {
        const L = await import('leaflet');
        if (cancelled || !mapContainerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = L.map(mapContainerRef.current, { zoomControl: true }).setView(mapCenter, 11);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(mapRef.current);
          cellLayerRef.current = L.layerGroup().addTo(mapRef.current);
        }

        if (cellLayerRef.current) {
          cellLayerRef.current.clearLayers();
        }

        for (const cell of cells) {
          const ratio = maxCount > 0 ? cell.count / maxCount : 0;
          const radius = 8 + ratio * 22;
          const circle = L.circleMarker([cell.lat, cell.lng], {
            radius,
            color: intensityColor(ratio),
            fillColor: intensityColor(ratio),
            fillOpacity: 0.45,
            weight: 1
          });
          circle.bindPopup(
            `<div style="font-size:12px;">` +
              `<strong>${cell.count} reported sighting${cell.count === 1 ? '' : 's'}</strong><br/>` +
              `near ${cell.lat.toFixed(3)}, ${cell.lng.toFixed(3)}` +
              `</div>`
          );
          circle.addTo(cellLayerRef.current);
        }

        setMapError(null);
      } catch (err) {
        console.error('Alert sightings heatmap failed:', err);
        setMapError('Heatmap failed to load. Refresh page to retry.');
      }
    };

    void renderHeatmap();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, maxCount]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        cellLayerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: BORDER }}>
      <p className="mb-2 text-[0.6875rem] leading-relaxed text-slate-500">{HEATMAP_DISCLAIMER}</p>
      <div className="overflow-hidden rounded-lg border" style={{ borderColor: BORDER }}>
        {mapError ? (
          <div className="flex h-[360px] items-center justify-center bg-slate-50 text-center text-[0.75rem] text-slate-600">
            {mapError}
          </div>
        ) : (
          <div ref={mapContainerRef} className="h-[360px] w-full" />
        )}
      </div>
      {cells.length === 0 && (
        <p className="mt-2 text-[0.75rem] text-slate-500">No reported sightings match the current filters.</p>
      )}
      {cells.length > 0 && (
        <p className="mt-2 text-[0.6875rem] text-slate-500">
          {cells.length} location{cells.length === 1 ? '' : 's'} with reported activity.
        </p>
      )}
    </div>
  );
}
