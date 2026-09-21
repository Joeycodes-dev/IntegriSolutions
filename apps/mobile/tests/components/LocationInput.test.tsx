import React, { useState } from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { LocationInput, EMPTY_LOCATION_VALUE, type LocationInputValue } from '../../src/components/LocationInput';
import * as api from '../../src/services/api';

jest.mock('../../src/services/api', () => ({
  searchLocation: jest.fn(),
  isNetworkRequestError: jest.fn((err: unknown) => err instanceof Error && /^Network error requesting/.test(err.message))
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 }
}));

function Harness({ initial }: { initial?: LocationInputValue }) {
  const [value, setValue] = useState<LocationInputValue>(initial ?? EMPTY_LOCATION_VALUE);
  return <LocationInput value={value} onChange={setValue} />;
}

describe('LocationInput (mobile)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults to search mode when no coordinates are set', () => {
    render(<Harness />);
    expect(screen.getByPlaceholderText('Search address, road, landmark or area')).toBeTruthy();
  });

  it('defaults to coordinates mode when a value already has coordinates', () => {
    render(<Harness initial={{ label: '', lat: '-26.2041', lng: '28.0473' }} />);
    expect(screen.getByPlaceholderText('-26.2041')).toBeTruthy();
    expect(screen.getByPlaceholderText('28.0473')).toBeTruthy();
  });

  it('switches between modes without losing already-entered coordinates', () => {
    render(<Harness initial={{ label: '', lat: '-26.2041', lng: '28.0473' }} />);
    fireEvent.press(screen.getByText('Search location'));
    expect(screen.getByPlaceholderText('Search address, road, landmark or area')).toBeTruthy();

    fireEvent.press(screen.getByText('Enter coordinates'));
    expect(screen.getByDisplayValue('-26.2041')).toBeTruthy();
    expect(screen.getByDisplayValue('28.0473')).toBeTruthy();
  });

  it('flags an out-of-range latitude', () => {
    render(<Harness />);
    fireEvent.press(screen.getByText('Enter coordinates'));
    fireEvent.changeText(screen.getByPlaceholderText('-26.2041'), '95');
    expect(screen.getByText('Must be between -90 and 90')).toBeTruthy();
  });

  it('flags an out-of-range longitude', () => {
    render(<Harness />);
    fireEvent.press(screen.getByText('Enter coordinates'));
    fireEvent.changeText(screen.getByPlaceholderText('28.0473'), '200');
    expect(screen.getByText('Must be between -180 and 180')).toBeTruthy();
  });

  it('accepts valid manual coordinates with no error shown', () => {
    render(<Harness />);
    fireEvent.press(screen.getByText('Enter coordinates'));
    fireEvent.changeText(screen.getByPlaceholderText('-26.2041'), '-25.9895');
    fireEvent.changeText(screen.getByPlaceholderText('28.0473'), '28.1265');
    expect(screen.queryByText('Must be between -90 and 90')).toBeNull();
    expect(screen.queryByText('Must be between -180 and 180')).toBeNull();
  });

  it('selecting a search result populates coordinates and the human-readable label', async () => {
    (api.searchLocation as jest.Mock).mockResolvedValue([
      { lat: -25.9895, lng: 28.1265, label: 'N1, Midrand, Gauteng, South Africa' }
    ]);
    render(<Harness />);

    fireEvent.changeText(screen.getByPlaceholderText('Search address, road, landmark or area'), 'N1 Midrand offramp');
    fireEvent.press(screen.getByText('Search'));

    await waitFor(() => {
      expect(screen.getByText('N1, Midrand, Gauteng, South Africa')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('N1, Midrand, Gauteng, South Africa'));

    await waitFor(() => {
      expect(screen.getByText(/-25.9895, 28.1265/)).toBeTruthy();
    });
    expect(api.searchLocation).toHaveBeenCalledWith('N1 Midrand offramp');
  });

  it('rejects a too-short search query without calling the API', async () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByPlaceholderText('Search address, road, landmark or area'), 'N1');
    fireEvent.press(screen.getByText('Search'));

    await waitFor(() => {
      expect(screen.getByText(/at least 3 characters/i)).toBeTruthy();
    });
    expect(api.searchLocation).not.toHaveBeenCalled();
  });

  it('"Use current location" requests permission only when tapped, not on mount', () => {
    render(<Harness />);
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('populates coordinates from a single one-shot GPS read on "Use current location"', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: -25.7479, longitude: 28.2293, accuracy: 15 }
    });

    render(<Harness />);
    fireEvent.press(screen.getByText('Use current location'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('-25.7479')).toBeTruthy();
    });
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('fails gracefully when location permission is denied, without crashing or setting a value', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    render(<Harness />);
    fireEvent.press(screen.getByText('Use current location'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('rejects a GPS fix that is too imprecise, per the shared accuracy safeguard', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: -25.7479, longitude: 28.2293, accuracy: 500 }
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    render(<Harness />);
    fireEvent.press(screen.getByText('Use current location'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Location too imprecise', expect.any(String));
    });
    expect(screen.queryByDisplayValue('-25.7479')).toBeNull();
    alertSpy.mockRestore();
  });

  it('shows no results without treating it as an error, and the coordinates fallback is still reachable', async () => {
    (api.searchLocation as jest.Mock).mockResolvedValue([]);
    render(<Harness />);

    fireEvent.changeText(screen.getByPlaceholderText('Search address, road, landmark or area'), 'somewhere unmappable');
    fireEvent.press(screen.getByText('Search'));

    await waitFor(() => {
      expect(screen.getByText(/No matching locations found/i)).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Enter coordinates'));
    expect(screen.getByPlaceholderText('-26.2041')).toBeTruthy();
  });

  it('shows a plain-language message (not a raw network error) when the search request cannot reach the backend, and keeps existing form data untouched', async () => {
    (api.searchLocation as jest.Mock).mockRejectedValue(new Error('Network error requesting http://api/geocode/search?q=x: TypeError: Network request failed'));
    render(<Harness initial={{ label: 'Existing label', lat: '-26.2041', lng: '28.0473' }} />);

    fireEvent.press(screen.getByText('Search location'));
    fireEvent.changeText(screen.getByPlaceholderText('Search address, road, landmark or area'), 'N1 Midrand offramp');
    fireEvent.press(screen.getByText('Search'));

    await waitFor(() => {
      expect(screen.getByText('Location search is temporarily unavailable — you can still enter coordinates manually')).toBeTruthy();
    });
    expect(screen.queryByText(/Network error requesting/i)).toBeNull();
    expect(screen.getByText(/-26.2041, 28.0473/)).toBeTruthy();
  });

  it('passes through our backend’s own error text for a non-network failure', async () => {
    (api.searchLocation as jest.Mock).mockRejectedValue(new Error('Location search is temporarily unavailable — you can still enter coordinates manually'));
    render(<Harness />);

    fireEvent.changeText(screen.getByPlaceholderText('Search address, road, landmark or area'), 'N1 Midrand offramp');
    fireEvent.press(screen.getByText('Search'));

    await waitFor(() => {
      expect(screen.getByText('Location search is temporarily unavailable — you can still enter coordinates manually')).toBeTruthy();
    });
  });

  it('never searches automatically while typing — only an explicit Search press triggers a request', () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText('Search address, road, landmark or area');
    fireEvent.changeText(input, 'N');
    fireEvent.changeText(input, 'N1');
    fireEvent.changeText(input, 'N1 M');
    fireEvent.changeText(input, 'N1 Midrand offramp');

    expect(api.searchLocation).not.toHaveBeenCalled();
  });

  it('clearing the location resets label, latitude and longitude', async () => {
    (api.searchLocation as jest.Mock).mockResolvedValue([{ lat: -25.9895, lng: 28.1265, label: 'N1, Midrand' }]);
    render(<Harness />);

    fireEvent.changeText(screen.getByPlaceholderText('Search address, road, landmark or area'), 'N1 Midrand');
    fireEvent.press(screen.getByText('Search'));
    await waitFor(() => screen.getByText('N1, Midrand'));
    fireEvent.press(screen.getByText('N1, Midrand'));

    await waitFor(() => screen.getByText('Clear'));
    fireEvent.press(screen.getByText('Clear'));

    expect(screen.queryByText('Clear')).toBeNull();
  });
});
