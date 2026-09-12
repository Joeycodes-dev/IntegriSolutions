import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { AlertSighting } from '../../types';
import { SIGHTING_DISCLAIMER, formatDateTimeShort, toMapMarkers } from '../../lib/alertSightings';
import { BORDER } from './supervisorStyles';

const DEFAULT_MAP_CENTER: [number, number] = [-26.2041, 28.0473];

// Red is reserved for Critical (genuine emergency/officer-safety/life-safety
// tier) — High uses orange, not red, so a routine urgent sighting is never
// visually confused with an emergency one. Colors are constrained to the
// leaflet-color-markers palette this map already uses.
const PRIORITY_ICON_COLOR: Record<string, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'gold',
  low: 'blue'
};

interface Props {
  sightings: AlertSighting[];
}

/**
 * Individual reported-sighting markers. Mirrors SupervisorOverview.tsx's
 * existing raw-Leaflet pattern exactly (dynamic import, ref-managed map/
 * marker-layer lifecycle) — no new dependency, no new rendering approach.
 * A marker is a "reported sighting" / "possible match" only — never labeled
 * as a confirmed location.
 */
export function SupervisorAlertsMap({ sightings }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const markers = toMapMarkers(sightings);
  const mapCenter: [number, number] = markers[0] ? [markers[0].lat, markers[0].lng] : DEFAULT_MAP_CENTER;

  useEffect(() => {
    let cancelled = false;

    const renderMap = async () => {
      try {
        const L = await import('leaflet');
        if (cancelled || !mapContainerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = L.map(mapContainerRef.current, { zoomControl: true }).setView(mapCenter, 11);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(mapRef.current);
          markerLayerRef.current = L.layerGroup().addTo(mapRef.current);
        }

        const iconFor = (priority: string) =>
          L.icon({
            iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${PRIORITY_ICON_COLOR[priority] ?? 'grey'}.png`,
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
          });

        if (markerLayerRef.current) {
          markerLayerRef.current.clearLayers();
        }

        for (const marker of markers) {
          const pin = L.marker([marker.lat, marker.lng], { icon: iconFor(marker.priority) });
          pin.bindPopup(
            `<div style="font-size:12px; max-width:220px;">` +
              `<strong>${marker.label}</strong><br/>` +
              `${marker.alertTypeLabel} · ${marker.priority.toUpperCase()}<br/>` +
              `Reported: ${formatDateTimeShort(marker.reportedAt)}<br/>` +
              `By: ${marker.officerName} (${marker.badgeNumber})<br/>` +
              `Source: ${marker.provenanceLabel}` +
              `</div>`
          );
          pin.addTo(markerLayerRef.current);
        }

        setMapError(null);
      } catch (err) {
        console.error('Alert sightings map failed:', err);
        setMapError('Map failed to load. Refresh page to retry.');
      }
    };

    void renderMap();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers]);

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
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: BORDER }}>
      <p className="mb-2 text-[0.6875rem] leading-relaxed text-slate-500">{SIGHTING_DISCLAIMER}</p>
      <div className="overflow-hidden rounded-lg border" style={{ borderColor: BORDER }}>
        {mapError ? (
          <div className="flex h-[360px] items-center justify-center bg-slate-50 text-center text-[0.75rem] text-slate-600">
            {mapError}
          </div>
        ) : (
          <div ref={mapContainerRef} className="h-[360px] w-full" />
        )}
      </div>
      {markers.length === 0 && (
        <p className="mt-2 text-[0.75rem] text-slate-500">No reported sightings match the current filters.</p>
      )}
      {markers.length > 0 && (
        <p className="mt-2 text-[0.6875rem] text-slate-500">{markers.length} reported sighting{markers.length === 1 ? '' : 's'} shown.</p>
      )}
    </div>
  );
}
