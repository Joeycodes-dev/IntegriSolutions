import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RoadOffenceReview } from '../../src/components/RoadOffenceReview';
import * as api from '../../src/services/api';
import type { RoadOffenceRecord } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({
  getRoadOffences: vi.fn(),
  addRoadOffenceReview: vi.fn(),
}));

function record(overrides: Partial<RoadOffenceRecord> = {}): RoadOffenceRecord {
  return {
    id: 'off-1',
    officer_name: 'John Doe',
    badge_number: 'B123',
    offence_type: 'speeding',
    driver_name: 'Driver A',
    driver_identifier: 'DL001',
    vehicle_registration: 'ABC123GP',
    vehicle_description: 'White Toyota',
    notes: 'Clocked at 140 in a 120 zone',
    action_taken: 'fine_or_notice',
    reference_number: 'REF-1',
    location: { lat: -26.2, lng: 28.0 },
    created_at: '2026-09-01T10:00:00Z',
    road_offence_reviews: [],
    road_offence_evidence: [],
    ...overrides,
  };
}

describe('RoadOffenceReview (new feature)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state then the empty state', async () => {
    (api.getRoadOffences as any).mockImplementation(() => new Promise(() => {}));
    render(<RoadOffenceReview />);
    expect(screen.getByText(/Loading road offences/i)).toBeInTheDocument();

    (api.getRoadOffences as any).mockResolvedValue([]);
    render(<RoadOffenceReview />);
    await waitFor(() => {
      expect(screen.getByText(/No road offences submitted/i)).toBeInTheDocument();
    });
  });

  it('lists immutable submissions with human labels and review status', async () => {
    (api.getRoadOffences as any).mockResolvedValue([
      record(),
      record({
        id: 'off-2',
        offence_type: 'no_seat_belt',
        vehicle_registration: '',
        road_offence_reviews: [
          { id: 3, action: 'verified', reason: 'Confirmed', reviewer_name: 'Sara Super', created_at: '2026-09-01T11:00:00Z' },
        ],
      }),
    ]);

    render(<RoadOffenceReview />);

    await waitFor(() => {
      expect(screen.getByText('Speeding')).toBeInTheDocument();
    });
    expect(screen.getByText('No seat belt')).toBeInTheDocument();
    expect(screen.getByText('ABC123GP')).toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(screen.getByText('Awaiting review')).toBeInTheDocument();
    expect(screen.getByText(/Verified by Sara Super/)).toBeInTheDocument();
    expect(screen.getByText('Immutable officer submissions with append-only superuser reviews.')).toBeInTheDocument();
  });

  it('shows a load error without crashing the table', async () => {
    (api.getRoadOffences as any).mockRejectedValue(new Error('Only supervisor accounts can review'));
    render(<RoadOffenceReview />);

    await waitFor(() => {
      expect(screen.getByText('Only supervisor accounts can review')).toBeInTheDocument();
    });
  });

  it('opens the read-only detail modal with evidence + history', async () => {
    (api.getRoadOffences as any).mockResolvedValue([
      record({
        road_offence_evidence: [
          { id: 9, storage_url: 'https://x/scene.jpg', file_name: 'scene.jpg', file_type: 'image/jpeg', file_size: 10, created_at: '2026-09-01T10:01:00Z' },
        ],
        road_offence_reviews: [
          { id: 4, action: 'referred', reason: 'Needs docket', reviewer_name: 'Sara Super', created_at: '2026-09-01T11:00:00Z' },
        ],
      }),
    ]);

    render(<RoadOffenceReview />);
    await waitFor(() => expect(screen.getByText('Speeding')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));

    expect(screen.getByText('Review road offence')).toBeInTheDocument();
    expect(screen.getByText('Clocked at 140 in a 120 zone')).toBeInTheDocument();
    expect(screen.getByText('Original officer submission is read-only. Add a review action with a reason below.')).toBeInTheDocument();
    expect(screen.getByAltText('scene.jpg')).toBeInTheDocument();
    expect(screen.getByText('Needs docket')).toBeInTheDocument();
  });

  it('submits a review action with a reason and reloads', async () => {
    (api.getRoadOffences as any).mockResolvedValue([record()]);
    (api.addRoadOffenceReview as any).mockResolvedValue({ id: 5 });

    render(<RoadOffenceReview />);
    await waitFor(() => expect(screen.getByText('Speeding')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));

    const save = screen.getByRole('button', { name: 'Save review action' });
    // Empty reason keeps the save disabled (append-only review requires a reason).
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Reason for this review action'), {
      target: { value: 'Confirmed via CCTV' },
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'referred' } });
    fireEvent.click(save);

    await waitFor(() => {
      expect(api.addRoadOffenceReview).toHaveBeenCalledWith('off-1', 'referred', 'Confirmed via CCTV');
    });
    // Modal closes and the list reloads after a successful review.
    await waitFor(() => {
      expect(api.getRoadOffences).toHaveBeenCalledTimes(2);
    });
  });

  it('surfaces review submission errors', async () => {
    (api.getRoadOffences as any).mockResolvedValue([record()]);
    (api.addRoadOffenceReview as any).mockRejectedValue(new Error('A valid review action and reason are required'));

    render(<RoadOffenceReview />);
    await waitFor(() => expect(screen.getByText('Speeding')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.change(screen.getByPlaceholderText('Reason for this review action'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save review action' }));

    await waitFor(() => {
      expect(screen.getByText('A valid review action and reason are required')).toBeInTheDocument();
    });
  });
});
