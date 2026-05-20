import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  roleId: 2,
  createdAt: '2026-01-01T00:00:00Z'
};

vi.mock('../../src/lib/AuthContext', () => ({
  useAuth: () => ({
    profile: mockProfile,
    signOut: vi.fn()
  })
}));

describe('SupervisorDashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows overview dashboard by default', async () => {
    vi.spyOn(api, 'getTests').mockResolvedValue([]);

    render(<SupervisorDashboard />);

    expect(screen.getByText('Overview Dashboard')).toBeInTheDocument();
    expect(screen.getByText(/Today's enforcement activity/i)).toBeInTheDocument();
    expect(screen.getByText('Live sync active')).toBeInTheDocument();
    expect(screen.getByText('Hotspot Map')).toBeInTheDocument();
  });

  it('renders metric values from test data', async () => {
    const today = new Date().toISOString();
    vi.spyOn(api, 'getTests').mockResolvedValue([
      {
        id: 'test-1',
        officerId: 1,
        officerName: 'Officer One',
        badgeNumber: 'B001',
        driverName: 'Driver A',
        driverId: 'DL001',
        bacReading: 0.08,
        result: 'fail' as const,
        createdAt: today,
        location: 'JHB',
        hash: 'abc'
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
        createdAt: today,
        location: 'JHB',
        hash: 'def'
      }
    ]);

    render(<SupervisorDashboard />);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    expect(screen.getByText('TOTAL TESTS')).toBeInTheDocument();
    expect(screen.getByText('TOTAL FAILURES')).toBeInTheDocument();
  });

  it('shows logs view with test records when navigating', async () => {
    vi.spyOn(api, 'getTests').mockResolvedValue([
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
        location: 'JHB',
        hash: 'abc'
      }
    ]);

    render(<SupervisorDashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Logs' }));

    await waitFor(() => {
      expect(screen.getByText('DL001')).toBeInTheDocument();
    });

    const row = screen.getByText('DL001').closest('tr');
    expect(row).toBeTruthy();
    fireEvent.click(row!);

    await waitFor(() => {
      expect(screen.getByText('Evidence Review')).toBeInTheDocument();
    });

    expect(screen.getByText('Driver & Incident Details')).toBeInTheDocument();
    expect(screen.getByText('Generate Court PDF')).toBeInTheDocument();
  });

  it('shows reports view with filters and charts', async () => {
    vi.spyOn(api, 'getTests').mockResolvedValue([
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
        location: JSON.stringify({ roadblock: 'Allandale Slip' }),
        hash: 'abc'
      }
    ]);

    render(<SupervisorDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }));

    await waitFor(() => {
      expect(screen.getByText('Reports & Analytics')).toBeInTheDocument();
    });

    expect(screen.getByText('Generate Weekly PDF Report')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('DUI Trends weekly')).toBeInTheDocument();
    expect(screen.getByText('Result Breakdown')).toBeInTheDocument();
    expect(screen.getByText(/Showing \d+ record/i)).toBeInTheDocument();
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
  });
});
