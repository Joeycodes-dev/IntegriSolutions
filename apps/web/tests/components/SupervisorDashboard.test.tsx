import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SupervisorDashboard } from '../../src/components/SupervisorDashboard';
import * as api from '../../src/services/api';

const mockProfile = {
  uid: 'officer-1',
  officerId: 1,
  email: 'supervisor@test.com',
  name: 'Jane',
  surname: 'Doe',
  badgeNumber: 'S001',
  idNumber: 'ID001',
  employmentStatus: 'Active',
  province: 'TestProvince',
  region: 'TestRegion',
  officerTypeId: 1,
  roleId: 1,
  createdAt: '2026-01-01T00:00:00Z',
};

vi.mock('../../src/lib/AuthContext', () => ({
  useAuth: () => ({
    profile: mockProfile,
    signOut: vi.fn(),
  }),
}));

describe('SupervisorDashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows loading state while fetching tests', async () => {
    vi.spyOn(api, 'getTests').mockImplementation(() => new Promise(() => {}));

    render(<SupervisorDashboard />);

    expect(screen.getByText(/Loading shift data/i)).toBeInTheDocument();
  });

  it('renders test records after fetch', async () => {
    const mockTests = [
      {
        id: 'test-1',
        officerId: 1,
        officerName: 'Officer One',
        badgeNumber: 'B001',
        driverName: 'Driver A',
        driverId: 'DL001',
        bacReading: 0.08,
        result: 'fail' as const,
        createdAt: '2026-05-15T10:00:00Z',
      },
      {
        id: 'test-2',
        officerId: 2,
        officerName: 'Officer Two',
        badgeNumber: 'B002',
        driverName: 'Driver B',
        driverId: 'DL002',
        bacReading: 0.0,
        result: 'pass' as const,
        createdAt: '2026-05-15T09:30:00Z',
      },
    ];

    vi.spyOn(api, 'getTests').mockResolvedValue(mockTests);

    render(<SupervisorDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Driver A')).toBeInTheDocument();
    });

    expect(screen.getByText('Driver B')).toBeInTheDocument();
    expect(screen.getByText('DUI')).toBeInTheDocument();
    expect(screen.getByText('PASS')).toBeInTheDocument();
  });

  it('shows empty state when no records exist', async () => {
    vi.spyOn(api, 'getTests').mockResolvedValue([]);

    render(<SupervisorDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/No test records found/i)).toBeInTheDocument();
    });
  });

  it('polls for new data every 10 seconds', async () => {
    const getTestsSpy = vi.spyOn(api, 'getTests').mockResolvedValue([]);

    render(<SupervisorDashboard />);

    await waitFor(() => {
      expect(getTestsSpy).toHaveBeenCalledTimes(1);
    });

    vi.advanceTimersByTime(10000);

    await waitFor(() => {
      expect(getTestsSpy).toHaveBeenCalledTimes(2);
    });

    vi.advanceTimersByTime(10000);

    await waitFor(() => {
      expect(getTestsSpy).toHaveBeenCalledTimes(3);
    });
  });
});
