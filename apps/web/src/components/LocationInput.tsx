import { useId, useState } from 'react';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { searchLocation, type GeocodeSearchResult } from '../services/api';
import { isValidLatitude, isValidLongitude } from '../lib/geo';

export interface LocationInputValue {
  label: string;
  lat: string;
  lng: string;
}

export const EMPTY_LOCATION_VALUE: LocationInputValue = { label: '', lat: '', lng: '' };

type LocationInputMode = 'search' | 'coordinates';

interface LocationInputProps {
  value: LocationInputValue;
  onChange: (value: LocationInputValue) => void;
  /** Matches the calling page's own input styling (each supervisor page
   * defines its own inputClassName/BORDER — see supervisorStyles.ts) so this
   * drops into any form without looking out of place. */
  inputClassName?: string;
  borderColor?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}

const DEFAULT_INPUT_CLASSNAME =
  'h-[32px] w-full rounded-lg border bg-white px-2.5 text-[0.75rem] text-slate-800 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200';
const DEFAULT_BORDER = '#E2E8F0';
const MIN_QUERY_LENGTH = 3;

/**
 * Standard location-entry pattern (web) — search by place name (proxied
 * through /api/geocode, see backend/src/routes/geocode.ts and
 * services/api.ts's searchLocation) with manual lat/lng kept as a fallback
 * for users who already know precise coordinates. See apps/mobile's
 * LocationInput.tsx for the platform-specific mobile equivalent (adds a
 * "Use current location" option); both resolve to the same
 * { label, lat, lng } shape so callers don't need platform-specific glue.
 */
export function LocationInput({
  value,
  onChange,
  inputClassName = DEFAULT_INPUT_CLASSNAME,
  borderColor = DEFAULT_BORDER,
  searchPlaceholder = 'Search address, road, landmark or area',
  disabled
}: LocationInputProps) {
  const groupId = useId();
  const [mode, setMode] = useState<LocationInputMode>(() => (value.lat || value.lng ? 'coordinates' : 'search'));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const hasLocation = value.lat.trim() !== '' || value.lng.trim() !== '' || value.label.trim() !== '';

  const latNum = value.lat.trim() ? Number(value.lat) : null;
  const lngNum = value.lng.trim() ? Number(value.lng) : null;
  const latError = latNum !== null && !isValidLatitude(latNum) ? 'Must be between -90 and 90' : null;
  const lngError = lngNum !== null && !isValidLongitude(lngNum) ? 'Must be between -180 and 180' : null;

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSearchError(`Enter at least ${MIN_QUERY_LENGTH} characters to search`);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const found = await searchLocation(trimmed);
      setResults(found);
      if (found.length === 0) {
        setSearchError('No matching locations found — try a different search or enter coordinates directly');
      }
    } catch (err) {
      // A TypeError here means fetch() itself failed (offline, DNS, CORS) —
      // our backend never got a chance to respond, so err.message is a raw
      // browser string ("Failed to fetch") rather than anything meant for a
      // user. Anything else is a message our own backend crafted to be
      // read directly (see backend/src/routes/geocode.ts), so pass it through.
      setSearchError(
        err instanceof TypeError
          ? 'Location search is temporarily unavailable — you can still enter coordinates manually'
          : err instanceof Error
            ? err.message
            : 'Location search failed'
      );
    } finally {
      setSearching(false);
    }
  };

  const selectResult = (result: GeocodeSearchResult) => {
    onChange({ label: result.label, lat: String(result.lat), lng: String(result.lng) });
    setResults(null);
    setQuery('');
    setSearchError(null);
  };

  const clearLocation = () => {
    onChange({ label: '', lat: '', lng: '' });
    setResults(null);
    setQuery('');
    setSearchError(null);
  };

  return (
    <div className="flex flex-col gap-2 md:col-span-2">
      <span className="text-[0.6875rem] font-semibold text-slate-600">Location input method</span>
      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 text-[0.75rem] text-slate-700">
          <input
            type="radio"
            name={`${groupId}-mode`}
            checked={mode === 'search'}
            disabled={disabled}
            onChange={() => setMode('search')}
          />
          Search location
        </label>
        <label className="flex items-center gap-1.5 text-[0.75rem] text-slate-700">
          <input
            type="radio"
            name={`${groupId}-mode`}
            checked={mode === 'coordinates'}
            disabled={disabled}
            onChange={() => setMode('coordinates')}
          />
          Enter coordinates
        </label>
      </div>

      {mode === 'search' ? (
        <div className="flex flex-col gap-1.5">
          <form onSubmit={(e) => void runSearch(e)} className="flex gap-1.5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className={inputClassName}
              style={{ borderColor }}
              disabled={disabled}
            />
            <button
              type="submit"
              disabled={disabled || searching}
              className="inline-flex h-[32px] shrink-0 items-center gap-1 rounded-lg border px-2.5 text-[0.75rem] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ borderColor }}
            >
              {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              Search
            </button>
          </form>
          {searchError && <p className="text-[0.6875rem] text-rose-600">{searchError}</p>}
          {results && results.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-lg border bg-white p-1" style={{ borderColor }}>
              {results.map((result, index) => (
                <li key={`${result.lat}-${result.lng}-${index}`}>
                  <button
                    type="button"
                    onClick={() => selectResult(result)}
                    className="flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left text-[0.75rem] text-slate-700 hover:bg-slate-50"
                  >
                    <MapPin size={13} className="mt-0.5 shrink-0 text-slate-400" />
                    <span className="min-w-0 truncate">{result.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] font-semibold text-slate-600">Latitude</span>
            <input
              value={value.lat}
              onChange={(e) => onChange({ ...value, lat: e.target.value })}
              placeholder="-26.2041"
              inputMode="decimal"
              disabled={disabled}
              className={inputClassName}
              style={{ borderColor: latError ? '#fda4af' : borderColor }}
            />
            {latError && <span className="text-[0.6875rem] text-rose-600">{latError}</span>}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] font-semibold text-slate-600">Longitude</span>
            <input
              value={value.lng}
              onChange={(e) => onChange({ ...value, lng: e.target.value })}
              placeholder="28.0473"
              inputMode="decimal"
              disabled={disabled}
              className={inputClassName}
              style={{ borderColor: lngError ? '#fda4af' : borderColor }}
            />
            {lngError && <span className="text-[0.6875rem] text-rose-600">{lngError}</span>}
          </label>
        </div>
      )}

      {hasLocation && (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-slate-50 px-2.5 py-1.5" style={{ borderColor }}>
          <span className="min-w-0 truncate text-[0.6875rem] text-slate-600">
            {value.label && <span className="font-semibold text-slate-700">{value.label}</span>}
            {value.label && (latNum !== null || lngNum !== null) && ' — '}
            {latNum !== null && lngNum !== null && `${latNum.toFixed(4)}, ${lngNum.toFixed(4)}`}
          </span>
          <button
            type="button"
            onClick={clearLocation}
            disabled={disabled}
            className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-semibold text-slate-500 hover:text-slate-700"
          >
            <X size={12} /> Clear
          </button>
        </div>
      )}
    </div>
  );
}
