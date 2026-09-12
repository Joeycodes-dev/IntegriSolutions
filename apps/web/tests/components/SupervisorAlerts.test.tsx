import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SupervisorAlerts, MATCH_ESCALATION_DISCLAIMER } from '../../src/components/supervisor/SupervisorAlerts';
import * as api from '../../src/services/api';

const mockAlerts = [
  {
    id: 'alert-general',
    alertType: 'general' as const,
    priority: 'medium' as const,
    description: 'Be advised: flooding on N1',
    vehicleRegistration: null,
    vehicleDescription: null,
    personName: null,
    personDescription: null,
    personReference: null,
    photoUrl: null,
    locationLat: null,
    locationLng: null,
    locationLabel: 'N1 Midrand',
    issuedBySource: 'supervisor_users' as const,
    issuedById: 7,
    issuedByName: 'supervisor',
    targetScope: 'all_officers' as const,
    targetShiftId: null,
    sourceType: 'internal' as const,
    sourceAuthority: null,
    sourceReference: null,
    status: 'active' as const,
    expiresAt: null,
    createdAt: '2026-09-09T10:00:00Z',
    updatedAt: '2026-09-09T10:00:00Z',
    assignedOfficerIds: [],
    acknowledgementCount: 2,
    matchCount: 1
  },
  {
    id: 'alert-bolo',
    alertType: 'bolo_vehicle' as const,
    priority: 'high' as const,
    description: 'Vehicle linked to armed robbery',
    vehicleRegistration: 'ABC123GP',
    vehicleDescription: 'Silver sedan',
    personName: null,
    personDescription: null,
    personReference: null,
    photoUrl: null,
    locationLat: null,
    locationLng: null,
    locationLabel: null,
    issuedBySource: 'supervisor_users' as const,
    issuedById: 7,
    issuedByName: 'supervisor',
    targetScope: 'all_officers' as const,
    targetShiftId: null,
    sourceType: 'external' as const,
    sourceAuthority: 'SAPS Klerksdorp',
    sourceReference: 'CAS 123/09/2026',
    status: 'active' as const,
    expiresAt: null,
    createdAt: '2026-09-09T09:00:00Z',
    updatedAt: '2026-09-09T09:00:00Z',
    assignedOfficerIds: [],
    acknowledgementCount: 0,
    matchCount: 0
  }
];

vi.mock('../../src/services/api', () => ({
  getOperationalAlerts: vi.fn(),
  getFieldOfficers: vi.fn(),
  getRoadblockShifts: vi.fn(),
  createOperationalAlert: vi.fn(),
  updateOperationalAlert: vi.fn(),
  getOperationalAlertMatches: vi.fn(),
  getOperationalAlertAcknowledgements: vi.fn(),
}));

describe('SupervisorAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getOperationalAlerts as any).mockResolvedValue(mockAlerts);
    (api.getFieldOfficers as any).mockResolvedValue([]);
    (api.getRoadblockShifts as any).mockResolvedValue([]);
    (api.getOperationalAlertMatches as any).mockResolvedValue([
      { id: 1, officerId: 23, officerName: 'John Doe', badgeNumber: 'B123', notes: 'Vehicle seen at N1 offramp', locationLat: null, locationLng: null, createdAt: '2026-09-09T10:05:00Z' }
    ]);
    (api.getOperationalAlertAcknowledgements as any).mockResolvedValue([
      { officerId: 23, officerName: 'John Doe', badgeNumber: 'B123', acknowledgedAt: '2026-09-09T10:01:00Z' },
      { officerId: 24, officerName: 'Jane Smith', badgeNumber: 'B124', acknowledgedAt: '2026-09-09T10:02:00Z' }
    ]);
  });

  it('renders the alert board with type, status, priority, and provenance badges', async () => {
    render(<SupervisorAlerts />);

    await waitFor(() => {
      expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument();
      expect(screen.getByText('Vehicle linked to armed robbery')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Internal').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/External — SAPS Klerksdorp \(Ref: CAS 123\/09\/2026\)/)).toBeInTheDocument();
  });

  it('locks the source selector to external when a BOLO type is chosen', async () => {
    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue('General'), { target: { value: 'bolo_person' } });

    const sourceSelect = screen.getByDisplayValue('External') as HTMLSelectElement;
    expect(sourceSelect).toBeDisabled();
  });

  it('creates a BOLO alert with an external source, authority, and reference', async () => {
    (api.createOperationalAlert as any).mockResolvedValue({ ...mockAlerts[1], id: 'alert-new' });

    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue('General'), { target: { value: 'bolo_person' } });
    fireEvent.change(screen.getByPlaceholderText('Be advised: flooding on N1 southbound'), {
      target: { value: 'Person wanted in connection with robbery' }
    });
    fireEvent.change(screen.getByPlaceholderText('SAPS Klerksdorp'), { target: { value: 'SAPS Klerksdorp' } });
    fireEvent.change(screen.getByPlaceholderText('CAS 123/09/2026'), { target: { value: 'CAS 999/09/2026' } });

    fireEvent.click(screen.getByRole('button', { name: /issue alert/i }));

    await waitFor(() => {
      expect(api.createOperationalAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          alertType: 'bolo_person',
          sourceType: 'external',
          sourceAuthority: 'SAPS Klerksdorp',
          sourceReference: 'CAS 999/09/2026'
        })
      );
    });
  });

  it('resolves an active alert', async () => {
    (api.updateOperationalAlert as any).mockResolvedValue({ ...mockAlerts[0], status: 'resolved' });

    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /resolve/i })[0]);

    await waitFor(() => {
      expect(api.updateOperationalAlert).toHaveBeenCalledWith('alert-general', { status: 'resolved' });
    });
  });

  it('shows the escalation-only disclaimer when viewing possible match reports', async () => {
    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /view reports/i }));

    await waitFor(() => {
      expect(screen.getByText(MATCH_ESCALATION_DISCLAIMER)).toBeInTheDocument();
      expect(screen.getByText('Vehicle seen at N1 offramp')).toBeInTheDocument();
    });
  });

  it('shows who acknowledged an alert in the acknowledgement detail view', async () => {
    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /view acknowledgements/i }));

    await waitFor(() => {
      expect(api.getOperationalAlertAcknowledgements).toHaveBeenCalledWith('alert-general');
      expect(screen.getByText('John Doe (B123)')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith (B124)')).toBeInTheDocument();
    });
  });

  it('displays an alert as expired once its expiry has passed, without an update call', async () => {
    (api.getOperationalAlerts as any).mockResolvedValue([
      {
        ...mockAlerts[0],
        id: 'alert-past-due',
        description: 'Past-due alert',
        status: 'active',
        expiresAt: '2020-01-01T00:00:00Z',
      }
    ]);

    render(<SupervisorAlerts />);

    await waitFor(() => {
      expect(screen.getByText('Past-due alert')).toBeInTheDocument();
      expect(screen.getByText('expired')).toBeInTheDocument();
    });

    expect(screen.queryByText('active')).not.toBeInTheDocument();
    expect(api.updateOperationalAlert).not.toHaveBeenCalled();
  });
});
