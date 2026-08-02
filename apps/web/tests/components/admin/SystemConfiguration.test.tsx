import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SystemConfiguration } from '../../../src/components/admin/SystemConfiguration';
import { getAdminConfig, updateAdminConfig } from '../../../src/services/api';
import type { AdminConfig } from '../../../src/types';

vi.mock('../../../src/services/api', () => ({
  getAdminConfig: vi.fn(),
  updateAdminConfig: vi.fn()
}));

const mockConfig: AdminConfig = {
  revision: 3,
  updatedAt: '2026-08-02T08:00:00Z',
  updatedBy: 'admin@example.com',
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
};

describe('SystemConfiguration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAdminConfig as any).mockResolvedValue(mockConfig);
  });

  it('renders the editable sections with current values', async () => {
    render(<SystemConfiguration />);

    await waitFor(() => {
      expect(screen.getByLabelText('Session timeout (minutes)')).toHaveValue(30);
    });

    expect(screen.getByLabelText('PDF export access')).toHaveValue('admin_supervisor');
    expect(screen.getByLabelText('Watermark text')).toHaveValue('IntegriScan Court Evidence');
    expect(screen.getByText('BAC Limits by Driver Category')).toBeInTheDocument();
    expect(screen.getByText(/Revision 3/)).toBeInTheDocument();
  });

  it('sends the typed update payload with the current revision', async () => {
    (updateAdminConfig as any).mockResolvedValue({
      ...mockConfig,
      revision: 4,
      auth: { sessionTimeoutMinutes: 60 }
    });

    render(<SystemConfiguration />);

    await waitFor(() => {
      expect(screen.getByLabelText('Session timeout (minutes)')).toHaveValue(30);
    });

    fireEvent.change(screen.getByLabelText('Session timeout (minutes)'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(updateAdminConfig).toHaveBeenCalledWith(3, {
        'auth.session_timeout_minutes': 60,
        'export.pdf_watermark_enabled': true,
        'export.pdf_watermark_text': 'IntegriScan Court Evidence',
        'export.pdf_access': 'admin_supervisor',
        'alerts.integrity_flag_count': 1,
        'alerts.failure_rate_change_points': 1,
        'alerts.roadblock_minimum_tests': 3,
        'alerts.avg_failing_bac_multiple': 2,
        'bac.general.limit_g100ml': 0.05,
        'bac.general.limit_mg1000ml': 0.24,
        'bac.professional.limit_g100ml': 0.02,
        'bac.professional.limit_mg1000ml': 0.1
      });
    });

    expect(screen.getByText(/Saved at/i)).toBeInTheDocument();
  });

  it('blocks saving invalid values', async () => {
    render(<SystemConfiguration />);

    await waitFor(() => {
      expect(screen.getByLabelText('Session timeout (minutes)')).toHaveValue(30);
    });

    fireEvent.change(screen.getByLabelText('Session timeout (minutes)'), { target: { value: '1' } });

    expect(screen.getByText(/Session timeout \(minutes\) must be between 5 and 1440/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(updateAdminConfig).not.toHaveBeenCalled();
  });

  it('recovers from a stale-revision conflict by reloading', async () => {
    (updateAdminConfig as any).mockRejectedValue(
      new Error('Configuration was updated by another administrator (revision 4).')
    );
    const reloaded = { ...mockConfig, revision: 4 };
    (getAdminConfig as any).mockResolvedValueOnce(mockConfig).mockResolvedValueOnce(reloaded);

    render(<SystemConfiguration />);

    await waitFor(() => {
      expect(screen.getByLabelText('Session timeout (minutes)')).toHaveValue(30);
    });

    fireEvent.change(screen.getByLabelText('Session timeout (minutes)'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(screen.getByText(/updated by another administrator/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/Revision 4/)).toBeInTheDocument();
    });
  });

  it('confirms before disabling PDF export', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<SystemConfiguration />);

    await waitFor(() => {
      expect(screen.getByLabelText('PDF export access')).toHaveValue('admin_supervisor');
    });

    fireEvent.change(screen.getByLabelText('PDF export access'), { target: { value: 'disabled' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(updateAdminConfig).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
