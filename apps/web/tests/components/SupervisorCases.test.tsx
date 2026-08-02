import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SupervisorCases } from '../../src/components/supervisor/SupervisorCases';
import * as api from '../../src/services/api';

const mockCases = [
  {
    id: 'case-new-1',
    officerId: 1,
    officerName: 'John Doe',
    badgeNumber: '12345',
    driverName: 'Jane Smith',
    driverId: '9876543210123',
    driverDob: '1990-01-01',
    bacReading: 0.08,
    result: 'fail' as const,
    location: JSON.stringify({ roadblock: 'N1 Midrand Roadblock' }),
    createdAt: '2026-05-30T10:00:00Z',
    caseStatus: 'new' as const,
    supervisorEmail: null,
    lastComment: null,
    caseUpdatedAt: null
  },
  {
    id: 'case-review-2',
    officerId: 2,
    officerName: 'Alice Johnson',
    badgeNumber: '67890',
    driverName: 'Bob Wilson',
    driverId: '1234567890123',
    driverDob: '1988-05-05',
    bacReading: 0.0,
    result: 'pass' as const,
    location: JSON.stringify({ roadblock: 'R21 Edenvale' }),
    createdAt: '2026-05-29T14:00:00Z',
    caseStatus: 'under_review' as const,
    supervisorEmail: 'supervisor@example.com',
    lastComment: 'Reviewing dashcam footage',
    caseUpdatedAt: '2026-05-29T15:00:00Z'
  },
  {
    id: 'case-verified-3',
    officerId: 1,
    officerName: 'John Doe',
    badgeNumber: '12345',
    driverName: 'Charlie Brown',
    driverId: '5555555555555',
    driverDob: '1975-12-12',
    bacReading: 0.12,
    result: 'fail' as const,
    location: JSON.stringify({ roadblock: 'N1 Midrand Roadblock' }),
    createdAt: '2026-05-28T09:00:00Z',
    caseStatus: 'verified' as const,
    supervisorEmail: 'supervisor@example.com',
    lastComment: 'All evidence confirmed',
    caseUpdatedAt: '2026-05-28T11:00:00Z'
  }
];

vi.mock('../../src/services/api', () => ({
  getCases: vi.fn(),
  getAnnotations: vi.fn(),
  getEvidence: vi.fn(),
  annotateTest: vi.fn(),
  uploadEvidence: vi.fn()
}));

describe('SupervisorCases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getCases as any).mockResolvedValue(mockCases);
    (api.getAnnotations as any).mockResolvedValue([]);
    (api.getEvidence as any).mockResolvedValue([]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the case queue with status chips and case rows', async () => {
    render(<SupervisorCases />);

    await waitFor(() => {
      expect(screen.getByText('Case Queue')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Wilson')).toBeInTheDocument();
      expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    });

    expect(screen.getAllByText('New').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Under Review').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Verified').length).toBeGreaterThanOrEqual(1);
  });

  it('filters the queue by case status via the API', async () => {
    render(<SupervisorCases />);

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Verified/ }));

    await waitFor(() => {
      expect(api.getCases).toHaveBeenCalledWith('verified');
    });
  });

  it('opens Evidence Review when a case row is clicked', async () => {
    render(<SupervisorCases />);

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Jane Smith'));

    await waitFor(() => {
      expect(screen.getByText('Evidence Review')).toBeInTheDocument();
      expect(screen.getByText('Driver & Incident Details')).toBeInTheDocument();
    });
  });

  it('shows an empty state when there are no cases', async () => {
    (api.getCases as any).mockResolvedValue([]);

    render(<SupervisorCases />);

    await waitFor(() => {
      expect(screen.getByText(/Tests sync into this queue automatically/i)).toBeInTheDocument();
    });
  });
});
