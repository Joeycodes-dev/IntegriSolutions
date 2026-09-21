import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocationInput, EMPTY_LOCATION_VALUE, type LocationInputValue } from '../../src/components/LocationInput';
import * as api from '../../src/services/api';

vi.mock('../../src/services/api', () => ({
  searchLocation: vi.fn()
}));

function Harness({ initial }: { initial?: LocationInputValue }) {
  const [value, setValue] = useState(initial ?? EMPTY_LOCATION_VALUE);
  return <LocationInput value={value} onChange={setValue} />;
}

describe('LocationInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to search mode when no coordinates are set', () => {
    render(<Harness />);
    expect(screen.getByPlaceholderText('Search address, road, landmark or area')).toBeInTheDocument();
  });

  it('defaults to coordinates mode when a value already has coordinates (e.g. editing)', () => {
    render(<Harness initial={{ label: '', lat: '-26.2041', lng: '28.0473' }} />);
    expect(screen.getByText('Latitude')).toBeInTheDocument();
    expect(screen.getByText('Longitude')).toBeInTheDocument();
  });

  it('switches between search and coordinates mode without losing already-entered coordinates', () => {
    render(<Harness initial={{ label: '', lat: '-26.2041', lng: '28.0473' }} />);
    fireEvent.click(screen.getByLabelText('Search location'));
    expect(screen.getByPlaceholderText('Search address, road, landmark or area')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Enter coordinates'));
    expect(screen.getByDisplayValue('-26.2041')).toBeInTheDocument();
    expect(screen.getByDisplayValue('28.0473')).toBeInTheDocument();
  });

  it('flags an out-of-range latitude', () => {
    render(<Harness initial={{ label: '', lat: '', lng: '' }} />);
    fireEvent.click(screen.getByLabelText('Enter coordinates'));
    const latInput = screen.getByPlaceholderText('-26.2041');
    fireEvent.change(latInput, { target: { value: '95' } });
    expect(screen.getByText('Must be between -90 and 90')).toBeInTheDocument();
  });

  it('flags an out-of-range longitude', () => {
    render(<Harness initial={{ label: '', lat: '', lng: '' }} />);
    fireEvent.click(screen.getByLabelText('Enter coordinates'));
    const lngInput = screen.getByPlaceholderText('28.0473');
    fireEvent.change(lngInput, { target: { value: '200' } });
    expect(screen.getByText('Must be between -180 and 180')).toBeInTheDocument();
  });

  it('accepts a valid latitude/longitude with no error shown', () => {
    render(<Harness initial={{ label: '', lat: '', lng: '' }} />);
    fireEvent.click(screen.getByLabelText('Enter coordinates'));
    fireEvent.change(screen.getByPlaceholderText('-26.2041'), { target: { value: '-25.9895' } });
    fireEvent.change(screen.getByPlaceholderText('28.0473'), { target: { value: '28.1265' } });
    expect(screen.queryByText('Must be between -90 and 90')).not.toBeInTheDocument();
    expect(screen.queryByText('Must be between -180 and 180')).not.toBeInTheDocument();
  });

  it('selecting a search result populates coordinates and the human-readable label', async () => {
    (api.searchLocation as any).mockResolvedValue([
      { lat: -25.9895, lng: 28.1265, label: 'N1, Midrand, Gauteng, South Africa' }
    ]);
    render(<Harness />);

    fireEvent.change(screen.getByPlaceholderText('Search address, road, landmark or area'), {
      target: { value: 'N1 Midrand offramp' }
    });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText('N1, Midrand, Gauteng, South Africa')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('N1, Midrand, Gauteng, South Africa'));

    await waitFor(() => {
      expect(screen.getByText(/-25.9895, 28.1265/)).toBeInTheDocument();
    });
    expect(api.searchLocation).toHaveBeenCalledWith('N1 Midrand offramp');
  });

  it('rejects a too-short search query without calling the API', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByPlaceholderText('Search address, road, landmark or area'), {
      target: { value: 'N1' }
    });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 3 characters/i)).toBeInTheDocument();
    });
    expect(api.searchLocation).not.toHaveBeenCalled();
  });

  it('shows no results without treating it as an error, and preserves the typed query intent (manual fallback still available)', async () => {
    (api.searchLocation as any).mockResolvedValue([]);
    render(<Harness />);

    fireEvent.change(screen.getByPlaceholderText('Search address, road, landmark or area'), {
      target: { value: 'somewhere unmappable' }
    });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText(/No matching locations found/i)).toBeInTheDocument();
    });
    // Coordinates fallback is still one click away.
    fireEvent.click(screen.getByLabelText('Enter coordinates'));
    expect(screen.getByText('Latitude')).toBeInTheDocument();
  });

  it('shows a plain-language message (not a raw network error) when the search request cannot reach the backend, and keeps existing form data untouched', async () => {
    (api.searchLocation as any).mockRejectedValue(new TypeError('Failed to fetch'));
    render(<Harness initial={{ label: 'Existing label', lat: '-26.2041', lng: '28.0473' }} />);

    fireEvent.click(screen.getByLabelText('Search location'));
    fireEvent.change(screen.getByPlaceholderText('Search address, road, landmark or area'), {
      target: { value: 'N1 Midrand offramp' }
    });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText('Location search is temporarily unavailable — you can still enter coordinates manually')).toBeInTheDocument();
    });
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
    // The coordinates entered before the failed search are still shown.
    expect(screen.getByText(/-26.2041, 28.0473/)).toBeInTheDocument();
  });

  it('passes through our backend’s own error text for a non-network failure (e.g. provider unavailable)', async () => {
    (api.searchLocation as any).mockRejectedValue(new Error('Location search is temporarily unavailable — you can still enter coordinates manually'));
    render(<Harness />);

    fireEvent.change(screen.getByPlaceholderText('Search address, road, landmark or area'), {
      target: { value: 'N1 Midrand offramp' }
    });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText('Location search is temporarily unavailable — you can still enter coordinates manually')).toBeInTheDocument();
    });
  });

  it('never searches automatically while typing — only an explicit Search click triggers a request', () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText('Search address, road, landmark or area');
    fireEvent.change(input, { target: { value: 'N' } });
    fireEvent.change(input, { target: { value: 'N1' } });
    fireEvent.change(input, { target: { value: 'N1 M' } });
    fireEvent.change(input, { target: { value: 'N1 Midrand offramp' } });

    expect(api.searchLocation).not.toHaveBeenCalled();
  });

  it('clearing the location resets label, latitude and longitude', async () => {
    (api.searchLocation as any).mockResolvedValue([{ lat: -25.9895, lng: 28.1265, label: 'N1, Midrand' }]);
    render(<Harness />);

    fireEvent.change(screen.getByPlaceholderText('Search address, road, landmark or area'), {
      target: { value: 'N1 Midrand' }
    });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    await waitFor(() => screen.getByText('N1, Midrand'));
    fireEvent.click(screen.getByText('N1, Midrand'));

    await waitFor(() => screen.getByText('Clear'));
    fireEvent.click(screen.getByText('Clear'));

    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });
});
