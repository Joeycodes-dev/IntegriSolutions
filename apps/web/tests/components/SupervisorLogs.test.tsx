import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SupervisorLogs } from '../../src/components/supervisor/SupervisorLogs';
import * as api from '../../src/services/api';

const mockTests = [
  {
    id: 'test-1',
    officerId: 1,
    officerName: 'John Doe',
    badgeNumber: '12345',
    driverName: 'Jane Smith',
    driverId: '9876543210123',
    bacReading: 0.08,
    result: 'fail' as const,
    createdAt: '2026-05-30T10:00:00Z',
    location: 'JHB',
    hash: 'abc123',
    hashValid: true
  },
  {
    id: 'test-2',
    officerId: 2,
    officerName: 'Alice Johnson',
    badgeNumber: '67890',
    driverName: 'Bob Wilson',
    driverId: '1234567890123',
    bacReading: 0.0,
    result: 'pass' as const,
    createdAt: '2026-05-29T14:00:00Z',
    location: 'CPT',
    hash: 'def456',
    hashValid: true
  },
  {
    id: 'test-3',
    officerId: 1,
    officerName: 'John Doe',
    badgeNumber: '12345',
    driverName: 'Charlie Brown',
    driverId: '5555555555555',
    bacReading: 0.12,
    result: 'fail' as const,
    createdAt: '2026-05-28T09:00:00Z',
    location: 'DBN',
    hash: 'ghi789',
    hashValid: false
  }
];

vi.mock('../../src/services/api', () => ({
  getTests: vi.fn()
}));

describe('SupervisorLogs', () => {
  const mockOnSelectTest = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getTests as any).mockResolvedValue(mockTests);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders test records in table', async () => {
    render(
      <SupervisorLogs
        tests={mockTests}
        loading={false}
        error={null}
        onSelectTest={mockOnSelectTest}
      />
    );

    vi.advanceTimersByTime(400);

    await waitFor(() => {
      expect(screen.getByText('Live Test Logs')).toBeInTheDocument();
      expect(screen.getByText('9876543210123')).toBeInTheDocument();
      expect(screen.getByText('1234567890123')).toBeInTheDocument();
      expect(screen.getByText('5555555555555')).toBeInTheDocument();
    });
  });

  it('displays INTEGRITY column with verification badges', async () => {
    render(
      <SupervisorLogs
        tests={mockTests}
        loading={false}
        error={null}
        onSelectTest={mockOnSelectTest}
      />
    );

    vi.advanceTimersByTime(400);

    await waitFor(() => {
      expect(screen.getByText('INTEGRITY')).toBeInTheDocument();
      expect(screen.getAllByText('VERIFIED').length).toBe(2);
      expect(screen.getByText('TAMPERED')).toBeInTheDocument();
    });
  });

  it('calls getTests with search filter when typing', async () => {
    render(
      <SupervisorLogs
        tests={mockTests}
        loading={false}
        error={null}
        onSelectTest={mockOnSelectTest}
      />
    );

    vi.advanceTimersByTime(400);

    const searchInput = screen.getByPlaceholderText(/Search by officer/i);
    fireEvent.change(searchInput, { target: { value: 'Jane Smith' } });

    vi.advanceTimersByTime(400);

    await waitFor(() => {
      expect(api.getTests).toHaveBeenCalledWith(expect.objectContaining({ search: 'Jane Smith' }));
    });
  });

  it('shows filters panel when Filters button is clicked', async () => {
    render(
      <SupervisorLogs
        tests={mockTests}
        loading={false}
        error={null}
        onSelectTest={mockOnSelectTest}
      />
    );

    vi.advanceTimersByTime(400);

    const filtersButton = screen.getByRole('button', { name: /Filters/i });
    fireEvent.click(filtersButton);

    await waitFor(() => {
      expect(screen.getByText('RESULT')).toBeInTheDocument();
      expect(screen.getByText('FROM')).toBeInTheDocument();
      expect(screen.getByText('TO')).toBeInTheDocument();
    });
  });

  it('calls onSelectTest when a row is clicked', async () => {
    render(
      <SupervisorLogs
        tests={mockTests}
        loading={false}
        error={null}
        onSelectTest={mockOnSelectTest}
      />
    );

    vi.advanceTimersByTime(400);

    await waitFor(() => {
      expect(screen.getByText('9876543210123')).toBeInTheDocument();
    });

    const row = screen.getByText('9876543210123').closest('tr');
    fireEvent.click(row!);

    expect(mockOnSelectTest).toHaveBeenCalledWith(mockTests[0]);
  });

  it('shows loading state initially', () => {
    (api.getTests as any).mockImplementation(() => new Promise(() => {}));

    render(
      <SupervisorLogs
        tests={[]}
        loading={true}
        error={null}
        onSelectTest={mockOnSelectTest}
      />
    );

    expect(screen.getByText('Loading logs...')).toBeInTheDocument();
  });

  it('shows error message when API fails', async () => {
    (api.getTests as any).mockRejectedValue(new Error('Failed to load tests'));

    render(
      <SupervisorLogs
        tests={[]}
        loading={false}
        error={null}
        onSelectTest={mockOnSelectTest}
      />
    );

    vi.advanceTimersByTime(400);

    await waitFor(() => {
      expect(screen.getByText('Failed to load tests')).toBeInTheDocument();
    });
  });
});
