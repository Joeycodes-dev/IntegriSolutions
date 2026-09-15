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
    vi.spyOn(api, 'getRuntimeConfig').mockResolvedValue({
      auth: { sessionTimeoutMinutes: 30 },
      export: {
        pdfWatermarkEnabled: true,
        pdfWatermarkText: 'IntegriScan Court Evidence',
        pdfAccess: 'admin_supervisor'
      },
      alerts: {
        integrityFlagCount: 1,
        failureRateChangePoints: 1,
        roadblockMinimumTests: 3,
        avgFailingBacMultiple: 2
      },
      bacLimits: [
        { key: 'general', label: 'General Driver', limitG100ml: 0.05, limitMg1000ml: 0.24 },
        { key: 'professional', label: 'Professional Driver', limitG100ml: 0.02, limitMg1000ml: 0.1 }
      ]
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows overview dashboard by default', async () => {
    vi.spyOn(api, 'getTests').mockResolvedValue([]);

    render(<SupervisorDashboard />);

    expect(screen.getByText('Overview Dashboard')).toBeInTheDocument();
    expect(screen.getByText(/Today's enforcement activity/i)).toBeInTheDocument();
    expect(screen.getByText('Live sync disconnected')).toBeInTheDocument();
    expect(screen.getByText('Hotspot Map')).toBeInTheDocument();
  });

  it('renders today-scoped KPI values from test, alert, and road-offence data', async () => {
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
    // Reproduces the reported bug exactly: 6 alerts, ALL with stored
    // status 'active', but 4 of them have an expiresAt in the past — only
    // a1 and a2 are genuinely still active. a3 is critical AND expired, so
    // it must be excluded from CRITICAL ALERTS too, not just ACTIVE ALERTS.
    vi.spyOn(api, 'getOperationalAlerts').mockResolvedValue([
      { id: 'a1', status: 'active', priority: 'critical', expiresAt: null } as any,
      { id: 'a2', status: 'active', priority: 'medium', expiresAt: '2999-01-01T00:00:00Z' } as any,
      { id: 'a3', status: 'active', priority: 'critical', expiresAt: '2020-01-01T00:00:00Z' } as any,
      { id: 'a4', status: 'active', priority: 'high', expiresAt: '2020-01-01T00:00:00Z' } as any,
      { id: 'a5', status: 'active', priority: 'low', expiresAt: '2020-01-01T00:00:00Z' } as any,
      { id: 'a6', status: 'active', priority: 'medium', expiresAt: '2020-01-01T00:00:00Z' } as any
    ]);
    vi.spyOn(api, 'getRoadOffences').mockResolvedValue([
      { id: 'ro1', created_at: today, road_offence_reviews: [] } as any,
      { id: 'ro2', created_at: '2020-01-01T00:00:00Z', road_offence_reviews: [{ id: 1 }] } as any
    ]);

    render(<SupervisorDashboard />);

    await waitFor(() => {
      expect(screen.getByText('TESTS TODAY')).toBeInTheDocument();
    });
    // 2 tests today, by 2 distinct officers today.
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText('ROAD OFFENCES TODAY')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE OFFICERS')).toBeInTheDocument();
    expect(screen.getByText('PENDING REVIEW')).toBeInTheDocument();

    // 6 alerts are stored as status: 'active', but only 2 (a1, a2) have not
    // passed their expiresAt — the Dashboard must show 2, not 6.
    await waitFor(() => {
      const activeAlertsCard = screen.getByText('ACTIVE ALERTS').closest('div');
      expect(activeAlertsCard).toHaveTextContent('2');
    });
    // Only a1 is both critical and still effectively active — a3 is
    // critical but expired, so it must not be counted here either.
    const criticalAlertsCard = screen.getByText('CRITICAL ALERTS').closest('div');
    expect(criticalAlertsCard).toHaveTextContent('1');
  });

  it('does not fail the Dashboard when alerts/road-offences fail to load', async () => {
    vi.spyOn(api, 'getTests').mockResolvedValue([]);
    vi.spyOn(api, 'getOperationalAlerts').mockRejectedValue(new Error('network down'));
    vi.spyOn(api, 'getRoadOffences').mockRejectedValue(new Error('network down'));

    render(<SupervisorDashboard />);

    await waitFor(() => {
      expect(screen.getByText('TESTS TODAY')).toBeInTheDocument();
    });
    expect(screen.getByText('ACTIVE ALERTS')).toBeInTheDocument();
  });

  it('shows logs as a read-only view when navigating', async () => {
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

    expect(row).not.toHaveAttribute('role', 'button');
    expect(screen.queryByText('Evidence Review')).not.toBeInTheDocument();
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
         location: JSON.stringify({
           roadblockId: 'shift-report-1',
           roadblock: 'Allandale Slip',
           station: 'Allandale SAPS',
           supervisorName: 'Supervisor One'
         }),
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
    expect(screen.getByText(/DUI Trends/i)).toBeInTheDocument();
    expect(screen.getByText('Result Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Capture Context Accountability')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Showing \d+ of \d+ record/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/Passed \(0\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Failed \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText('shift-report-1')).toBeInTheDocument();
    });

    // Chart cards use a fixed height (not just a min-height) so a small
    // donut/bar chart can't be stretched into an oversized, mostly-empty
    // card by its taller row sibling — see ReportCharts.tsx / SupervisorReports.tsx.
    const trendCard = screen.getByText(/DUI Trends/i).closest('section');
    const breakdownCard = screen.getByText('Result Breakdown').closest('section');
    expect(trendCard).toHaveClass('h-[300px]', 'lg:h-[360px]');
    expect(breakdownCard).toHaveClass('h-[300px]', 'lg:h-[360px]');

    const captureContextCard = screen.getByText('Failures by Capture Context').closest('section');
    const bacCard = screen.getByText('BAC Distribution').closest('section');
    expect(captureContextCard).toHaveClass('h-[240px]', 'lg:h-[280px]');
    expect(bacCard).toHaveClass('h-[240px]', 'lg:h-[280px]');

    // The accountability table is naturally variable-length (a table, not a
    // chart) and should stay unconstrained rather than sharing a fixed height.
    const accountabilityCard = screen.getByText('Capture Context Accountability').closest('section');
    expect(accountabilityCard?.className).not.toMatch(/h-\[\d+px\]/);
  });

  it('uses slower fallback polling when live updates are unavailable', async () => {
    const getTestsSpy = vi.spyOn(api, 'getTests').mockResolvedValue([]);

    render(<SupervisorDashboard />);

    await waitFor(() => {
      expect(getTestsSpy).toHaveBeenCalledTimes(1);
    });

    vi.advanceTimersByTime(10000);

    expect(getTestsSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50000);

    await waitFor(() => {
      expect(getTestsSpy).toHaveBeenCalledTimes(2);
    });
  });
});
