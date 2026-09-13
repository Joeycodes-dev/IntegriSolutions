import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SupervisorAlerts, MATCH_ESCALATION_DISCLAIMER, parseExpiresAtInput } from '../../src/components/supervisor/SupervisorAlerts';
import * as api from '../../src/services/api';

/** Mirrors the component's own ISO -> datetime-local conversion, computed
 * against the test runner's local timezone so assertions never depend on
 * which timezone the runner happens to be in. */
function expectedDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Mirrors the component's formatDateTime(), same timezone-independence rationale. */
function expectedFormattedDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
  getOperationalAlertCoverage: vi.fn(),
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

  it('resolves an active alert after providing a required reason', async () => {
    (api.updateOperationalAlert as any).mockResolvedValue({ ...mockAlerts[0], status: 'resolved' });

    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /^resolve$/i })[0]);

    const reasonInput = await screen.findByPlaceholderText(/flooding has subsided/i);
    fireEvent.change(reasonInput, { target: { value: 'Flooding has subsided, road reopened' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(api.updateOperationalAlert).toHaveBeenCalledWith('alert-general', {
        status: 'resolved',
        reason: 'Flooding has subsided, road reopened',
      });
    });
  });

  it('does not submit a status change without a reason', async () => {
    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /^cancel$/i })[0]);

    const confirmButton = await screen.findByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeDisabled();
    expect(api.updateOperationalAlert).not.toHaveBeenCalled();
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

  it('shows acknowledgement coverage and outstanding officers when expanded', async () => {
    (api.getOperationalAlertCoverage as any).mockResolvedValue({
      alertId: 'alert-general',
      version: 1,
      priority: 'medium',
      status: 'active',
      targetScope: 'all_officers',
      totalTargeted: 3,
      acknowledgedCount: 2,
      outstandingCount: 1,
      percentage: 67,
      acknowledgedOfficers: [],
      outstandingOfficers: [{ officerId: 25, officerName: 'Sam Outstanding', badgeNumber: 'B125' }],
      criticalNonAckWarning: false,
      criticalNonAckThresholdMinutes: 15,
    });

    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /view coverage/i })[0]);

    await waitFor(() => {
      expect(api.getOperationalAlertCoverage).toHaveBeenCalledWith('alert-general');
      expect(screen.getByText('Sam Outstanding (B125)')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/2\/3 acknowledged \(67%\)/).length).toBeGreaterThanOrEqual(1);
  });

  it('surfaces a Critical non-acknowledgement warning without requiring a click', async () => {
    (api.getOperationalAlerts as any).mockResolvedValue([
      { ...mockAlerts[0], id: 'alert-critical', priority: 'critical', description: 'Officer down — shots fired' }
    ]);
    (api.getOperationalAlertCoverage as any).mockResolvedValue({
      alertId: 'alert-critical',
      version: 1,
      priority: 'critical',
      status: 'active',
      targetScope: 'all_officers',
      totalTargeted: 5,
      acknowledgedCount: 1,
      outstandingCount: 4,
      percentage: 20,
      acknowledgedOfficers: [],
      outstandingOfficers: [],
      criticalNonAckWarning: true,
      criticalNonAckThresholdMinutes: 15,
    });

    render(<SupervisorAlerts />);

    await waitFor(() => {
      expect(api.getOperationalAlertCoverage).toHaveBeenCalledWith('alert-critical');
      expect(screen.getByText(/4 officers still unacknowledged/i)).toBeInTheDocument();
      expect(screen.getByText(/awareness only, no automatic action taken/i)).toBeInTheDocument();
    });
  });

  it('flags a long-active alert as review required without changing its status', async () => {
    (api.getOperationalAlerts as any).mockResolvedValue([
      { ...mockAlerts[0], id: 'alert-old', description: 'Stale general notice', createdAt: '2020-01-01T00:00:00Z' }
    ]);

    render(<SupervisorAlerts />);

    await waitFor(() => {
      expect(screen.getByText('Stale general notice')).toBeInTheDocument();
      expect(screen.getByText(/review required/i)).toBeInTheDocument();
    });
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(api.updateOperationalAlert).not.toHaveBeenCalled();
  });

  it('edits an alert priority through the minimal edit UI (Phase A1 flow)', async () => {
    (api.updateOperationalAlert as any).mockResolvedValue({ ...mockAlerts[0], priority: 'critical' });

    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);

    const editPanelHeading = await screen.findByText('Edit alert');
    const editPanel = editPanelHeading.closest('div') as HTMLElement;
    const prioritySelect = within(editPanel).getByDisplayValue('medium');
    fireEvent.change(prioritySelect, { target: { value: 'critical' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(api.updateOperationalAlert).toHaveBeenCalledWith('alert-general', { priority: 'critical' });
    });
  });

  it('prefills the edit form with the alert\'s current expiry', async () => {
    const expiresAtIso = '2027-03-15T14:30:00.000Z';
    (api.getOperationalAlerts as any).mockResolvedValue([{ ...mockAlerts[0], expiresAt: expiresAtIso }]);

    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);

    const editPanelHeading = await screen.findByText('Edit alert');
    const editPanel = editPanelHeading.closest('div') as HTMLElement;
    expect(within(editPanel).getByDisplayValue(expectedDateTimeLocal(expiresAtIso))).toBeInTheDocument();
  });

  it('lets a Supervisor extend the expiry and sends only expiresAt through updateOperationalAlert', async () => {
    (api.getOperationalAlerts as any).mockResolvedValue([{ ...mockAlerts[0], expiresAt: '2027-03-15T14:30:00.000Z' }]);
    (api.updateOperationalAlert as any).mockResolvedValue({ ...mockAlerts[0], expiresAt: '2027-04-01T09:00:00.000Z' });

    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);

    const editPanelHeading = await screen.findByText('Edit alert');
    const editPanel = editPanelHeading.closest('div') as HTMLElement;
    const expiryInput = within(editPanel).getByDisplayValue(expectedDateTimeLocal('2027-03-15T14:30:00.000Z'));
    fireEvent.change(expiryInput, { target: { value: '2027-04-01T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(api.updateOperationalAlert).toHaveBeenCalledWith('alert-general', {
        expiresAt: new Date('2027-04-01T09:00').toISOString(),
      });
    });

    // No client-side materiality/versioning flags were invented for the expiry
    // edit — the backend alone decides whether this bump is material.
    const [, sentPayload] = (api.updateOperationalAlert as any).mock.calls[0];
    expect(sentPayload).not.toHaveProperty('materialChangeOverride');
    expect(Object.keys(sentPayload)).toEqual(['expiresAt']);
  });

  it('lets a Supervisor shorten the expiry', async () => {
    (api.getOperationalAlerts as any).mockResolvedValue([{ ...mockAlerts[0], expiresAt: '2027-03-15T14:30:00.000Z' }]);
    (api.updateOperationalAlert as any).mockResolvedValue({ ...mockAlerts[0], expiresAt: '2027-03-15T10:00:00.000Z' });

    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);

    const editPanelHeading = await screen.findByText('Edit alert');
    const editPanel = editPanelHeading.closest('div') as HTMLElement;
    const expiryInput = within(editPanel).getByDisplayValue(expectedDateTimeLocal('2027-03-15T14:30:00.000Z'));
    fireEvent.change(expiryInput, { target: { value: '2027-03-15T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(api.updateOperationalAlert).toHaveBeenCalledWith('alert-general', {
        expiresAt: new Date('2027-03-15T10:00').toISOString(),
      });
    });
  });

  it('refreshes the displayed expiry on the alert card after a successful save', async () => {
    (api.getOperationalAlerts as any).mockResolvedValue([{ ...mockAlerts[0], expiresAt: '2027-03-15T14:30:00.000Z' }]);
    (api.updateOperationalAlert as any).mockResolvedValue({ ...mockAlerts[0], expiresAt: '2027-04-01T09:00:00.000Z' });

    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());
    const originalExpiryText = `Expires ${expectedFormattedDateTime('2027-03-15T14:30:00.000Z')}`;
    const updatedExpiryText = `Expires ${expectedFormattedDateTime('2027-04-01T09:00:00.000Z')}`;
    expect(screen.getByText(new RegExp(originalExpiryText))).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);
    const editPanelHeading = await screen.findByText('Edit alert');
    const editPanel = editPanelHeading.closest('div') as HTMLElement;
    const expiryInput = within(editPanel).getByDisplayValue(expectedDateTimeLocal('2027-03-15T14:30:00.000Z'));
    fireEvent.change(expiryInput, { target: { value: '2027-04-01T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(new RegExp(updatedExpiryText))).toBeInTheDocument();
    });
    expect(screen.queryByText(new RegExp(originalExpiryText))).not.toBeInTheDocument();
  });

  it('rejects an unparseable expiry with a clear validation error (unit-level)', () => {
    // A native <input type="datetime-local"> sanitizes any syntactically
    // invalid text to '' before onChange ever fires (verified against
    // jsdom, which matches real browsers here) — so this specific failure
    // mode can't be reproduced by simulating DOM input. It's tested
    // directly against the parsing function saveEdit actually calls, which
    // is the real contract: "an unparseable value is rejected with a clear
    // message," independent of how such a value might arrive.
    expect(parseExpiresAtInput('not-a-real-date')).toEqual({
      ok: false,
      error: 'Enter a valid expiry date and time',
    });
  });

  it('treats an empty expiry field as "no expiry" rather than an error', () => {
    expect(parseExpiresAtInput('')).toEqual({ ok: true, iso: null });
    expect(parseExpiresAtInput('   ')).toEqual({ ok: true, iso: null });
  });

  it('clears the expiry (sets it to indefinite) when the field is emptied', async () => {
    (api.getOperationalAlerts as any).mockResolvedValue([{ ...mockAlerts[0], expiresAt: '2027-03-15T14:30:00.000Z' }]);
    (api.updateOperationalAlert as any).mockResolvedValue({ ...mockAlerts[0], expiresAt: null });

    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);
    const editPanelHeading = await screen.findByText('Edit alert');
    const editPanel = editPanelHeading.closest('div') as HTMLElement;
    fireEvent.click(within(editPanel).getByRole('button', { name: /clear/i }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(api.updateOperationalAlert).toHaveBeenCalledWith('alert-general', { expiresAt: null });
    });
  });

  it('does not send an expiry change when the field is left untouched', async () => {
    (api.getOperationalAlerts as any).mockResolvedValue([{ ...mockAlerts[0], expiresAt: '2027-03-15T14:30:00.000Z' }]);
    (api.updateOperationalAlert as any).mockResolvedValue({ ...mockAlerts[0], priority: 'high' });

    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);
    const editPanelHeading = await screen.findByText('Edit alert');
    const editPanel = editPanelHeading.closest('div') as HTMLElement;
    const prioritySelect = within(editPanel).getByDisplayValue('medium');
    fireEvent.change(prioritySelect, { target: { value: 'high' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(api.updateOperationalAlert).toHaveBeenCalledWith('alert-general', { priority: 'high' });
    });
    const [, sentPayload] = (api.updateOperationalAlert as any).mock.calls[0];
    expect(sentPayload).not.toHaveProperty('expiresAt');
  });

  it('requires the material-change checkbox to be set before a description-only edit is sent as material', async () => {
    (api.updateOperationalAlert as any).mockResolvedValue(mockAlerts[0]);

    render(<SupervisorAlerts />);
    await waitFor(() => expect(screen.getByText('Be advised: flooding on N1')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);

    const descriptionInput = await screen.findByDisplayValue('Be advised: flooding on N1');
    fireEvent.change(descriptionInput, { target: { value: 'Be advised: flooding on the N1 (typo fix)' } });

    const checkbox = await screen.findByRole('checkbox', { name: /changes operational meaning/i });
    fireEvent.click(checkbox);

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(api.updateOperationalAlert).toHaveBeenCalledWith('alert-general', {
        description: 'Be advised: flooding on the N1 (typo fix)',
        materialChangeOverride: true,
      });
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
