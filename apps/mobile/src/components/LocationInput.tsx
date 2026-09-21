import React, { useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { searchLocation, isNetworkRequestError, type GeocodeSearchResult } from '../services/api';
import { isValidLatitude, isValidLongitude, LOCATION_ACCURACY_THRESHOLD_METERS } from '../lib/geo';
import { colors } from '../styles/colors';

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
  searchPlaceholder?: string;
  disabled?: boolean;
}

const MIN_QUERY_LENGTH = 3;

/**
 * Standard location-entry pattern (mobile) — search by place name (proxied
 * through /api/geocode) or "Use current location", with manual lat/lng kept
 * as a fallback. Mirrors apps/web's LocationInput.tsx (same
 * { label, lat, lng } shape) but adds the mobile-only current-location
 * option; permission is requested only when the officer taps that button,
 * never on mount, and this is a single one-shot GPS read (no watchPosition,
 * no background tracking) with the same accuracy guard used on Home (see
 * lib/geo.ts's LOCATION_ACCURACY_THRESHOLD_METERS).
 */
export function LocationInput({ value, onChange, searchPlaceholder = 'Search address, road, landmark or area', disabled }: LocationInputProps) {
  const [mode, setMode] = useState<LocationInputMode>(() => (value.lat || value.lng ? 'coordinates' : 'search'));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const hasLocation = value.lat.trim() !== '' || value.lng.trim() !== '' || value.label.trim() !== '';
  const latNum = value.lat.trim() ? Number(value.lat) : null;
  const lngNum = value.lng.trim() ? Number(value.lng) : null;
  const latError = latNum !== null && !isValidLatitude(latNum) ? 'Must be between -90 and 90' : null;
  const lngError = lngNum !== null && !isValidLongitude(lngNum) ? 'Must be between -180 and 180' : null;

  const runSearch = async () => {
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
      // A network-level failure (offline, unreachable backend) is wrapped by
      // services/api.ts's request() with a "Network error requesting..."
      // message meant for logs, not officers — swap in a plain-language
      // message. Anything else is our own backend's crafted, user-facing
      // text (see backend/src/routes/geocode.ts), so pass it through as-is.
      setSearchError(
        isNetworkRequestError(err)
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

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location permission needed', 'Allow location access to use your current position, or enter it manually.');
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude, accuracy } = current.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        Alert.alert('Location unavailable', 'Could not read a valid position from this device.');
        return;
      }
      if (accuracy != null && accuracy > LOCATION_ACCURACY_THRESHOLD_METERS) {
        Alert.alert('Location too imprecise', 'Your current GPS fix is not accurate enough right now — try again in the open, or enter the location manually.');
        return;
      }
      onChange({ label: '', lat: String(latitude), lng: String(longitude) });
      setMode('coordinates');
    } catch {
      Alert.alert('Location unavailable', 'Could not read your current position.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>Location input method</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <ModeChip label="Search location" selected={mode === 'search'} onPress={() => setMode('search')} disabled={disabled} />
        <ModeChip label="Enter coordinates" selected={mode === 'coordinates'} onPress={() => setMode('coordinates')} disabled={disabled} />
      </View>

      <TouchableOpacity
        onPress={() => void useCurrentLocation()}
        disabled={disabled || locating}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          height: 36,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.borderLight,
          backgroundColor: colors.surfaceHighlight,
          opacity: disabled || locating ? 0.6 : 1
        }}
      >
        {locating ? <ActivityIndicator size="small" color={colors.textPrimary} /> : null}
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>Use current location</Text>
      </TouchableOpacity>

      {mode === 'search' ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor="#94a3b8"
              editable={!disabled}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.borderLight,
                backgroundColor: colors.background,
                paddingHorizontal: 10,
                fontSize: 13,
                color: colors.textPrimary
              }}
            />
            <TouchableOpacity
              onPress={() => void runSearch()}
              disabled={disabled || searching}
              style={{
                width: 72,
                height: 40,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primaryDark,
                opacity: disabled || searching ? 0.6 : 1
              }}
            >
              {searching ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Search</Text>}
            </TouchableOpacity>
          </View>
          {searchError && <Text style={{ fontSize: 11, color: colors.errorText }}>{searchError}</Text>}
          {results && results.length > 0 && (
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.background }}>
              {results.map((result, index) => (
                <TouchableOpacity
                  key={`${result.lat}-${result.lng}-${index}`}
                  onPress={() => selectResult(result)}
                  style={{
                    padding: 10,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.borderLight
                  }}
                >
                  <Text style={{ fontSize: 12, color: colors.textPrimary }} numberOfLines={2}>
                    {result.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>Latitude</Text>
            <TextInput
              value={value.lat}
              onChangeText={(text) => onChange({ ...value, lat: text })}
              placeholder="-26.2041"
              placeholderTextColor="#94a3b8"
              editable={!disabled}
              style={{
                height: 40,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: latError ? colors.errorBorder : colors.borderLight,
                backgroundColor: colors.background,
                paddingHorizontal: 10,
                fontSize: 13,
                color: colors.textPrimary
              }}
            />
            {latError && <Text style={{ fontSize: 11, color: colors.errorText }}>{latError}</Text>}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>Longitude</Text>
            <TextInput
              value={value.lng}
              onChangeText={(text) => onChange({ ...value, lng: text })}
              placeholder="28.0473"
              placeholderTextColor="#94a3b8"
              editable={!disabled}
              style={{
                height: 40,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: lngError ? colors.errorBorder : colors.borderLight,
                backgroundColor: colors.background,
                paddingHorizontal: 10,
                fontSize: 13,
                color: colors.textPrimary
              }}
            />
            {lngError && <Text style={{ fontSize: 11, color: colors.errorText }}>{lngError}</Text>}
          </View>
        </View>
      )}

      {hasLocation && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: 8,
            borderRadius: 10,
            backgroundColor: colors.surfaceHighlight
          }}
        >
          <Text style={{ flex: 1, fontSize: 11, color: colors.textSecondary }} numberOfLines={2}>
            {value.label ? `${value.label}${latNum != null && lngNum != null ? ' — ' : ''}` : ''}
            {latNum != null && lngNum != null ? `${latNum.toFixed(4)}, ${lngNum.toFixed(4)}` : ''}
          </Text>
          <TouchableOpacity onPress={clearLocation} disabled={disabled}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function ModeChip({ label, selected, onPress, disabled }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: selected ? colors.primaryDark : colors.borderLight,
        backgroundColor: selected ? colors.primaryDark : colors.background
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', color: selected ? '#fff' : colors.textSecondary }}>{label}</Text>
    </TouchableOpacity>
  );
}
