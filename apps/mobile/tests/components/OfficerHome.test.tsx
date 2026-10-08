import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { OfficerHome } from '../../src/components/OfficerHome';
import type { ActiveTestDraftPayload } from '../../src/lib/activeTestDraft';

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

const profile = {
  uid: 'officer-1',
  officerId: 1,
  email: 'officer@example.com',
  name: 'Test',
  surname: 'Officer',
  badgeNumber: 'B001',
  idNumber: '9001015800087',
  employmentStatus: 'Active',
  province: 'Gauteng',
  region: 'Johannesburg',
  officerTypeId: 1,
  roleId: 1,
  createdAt: '2026-09-24T00:00:00.000Z',
};

const draft: ActiveTestDraftPayload = {
  kind: 'active-test',
  schemaVersion: 1,
  draftId: 'draft-1',
  plannedTestId: 'planned-1',
  createdAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-24T10:05:00.000Z',
  owner: {
    ownerKey: 'officer:1',
    officerId: 1,
    officerUid: 'officer-1',
  },
  step: 'reading',
  subjectSource: 'barcode',
  scannedData: {
    name: 'Jane',
    surname: 'Driver',
    initials: 'JD',
    idNumber: '9001015800087',
    licenseNumber: 'DL123',
    dob: '1990-01-01',
    expiryDate: '2030-01-01',
    licenseCodes: 'B',
  },
  decryptedData: null,
  decryptError: null,
  officerNotes: 'Pending notes',
  bacReading: '0.025',
  capturedDeviceEvidence: null,
  photoUri: null,
  attachments: [],
  selectedShift: null,
  policy: null,
  retest: null,
  autoWorkflow: false,
  pendingCapture: null,
};

const baseProps = {
  profile,
  pendingCount: 0,
  todayCount: 0,
  weekCount: 0,
  recentStops: [],
  onStartSession: jest.fn(),
  onOpenRoadOffence: jest.fn(),
  onOpenReports: jest.fn(),
  onOpenAudit: jest.fn(),
};

describe('OfficerHome capture affordances', () => {
  it('names the primary action and the step that follows', () => {
    render(<OfficerHome {...baseProps} />);

    // Participants asked for a clearer "Start test / Scan licence" affordance.
    expect(screen.getByText('Start Test')).toBeTruthy();
    expect(screen.getByText("Scan the front of the driver's licence")).toBeTruthy();
    expect(screen.getByText('SCAN LICENCE')).toBeTruthy();

    // The flow is spelled out so officers know what happens next.
    expect(screen.getByText('What happens next')).toBeTruthy();
    expect(screen.getByText('Scan the front')).toBeTruthy();
    expect(screen.getByText('Breath test')).toBeTruthy();
    expect(screen.getByText('Save the record')).toBeTruthy();
  });

  it('directs officers to the front of the licence without mentioning a barcode', () => {
    render(<OfficerHome {...baseProps} />);

    expect(screen.getByText('Which side to scan')).toBeTruthy();
    // The front carries the details we need; the back has none.
    expect(
      screen.getByText(/the side carrying the driver's name, initials and expiry date we need/),
    ).toBeTruthy();

    // Kept short and simple, and never talks about a barcode.
    expect(screen.queryByText(/back has no details/i)).toBeNull();
    expect(screen.queryByText(/barcode/i)).toBeNull();
    expect(screen.queryByText(/PDF417/i)).toBeNull();
  });

  it('does not duplicate the sync console on Home', () => {
    render(<OfficerHome {...baseProps} pendingCount={2} />);

    // Sync is reachable from the persistent status bar under the header, the
    // saved-record screen, and its own actions. Repeating it here outranked
    // the one action officers open the app to perform.
    expect(screen.queryByText('SYNC CENTRE')).toBeNull();
    expect(screen.queryByText('Sync now')).toBeNull();
    expect(screen.queryByText('Sync Centre')).toBeNull();
  });

  it('still surfaces the pending record count in the stats', () => {
    render(<OfficerHome {...baseProps} pendingCount={2} />);

    expect(screen.getByText('Pending')).toBeTruthy();
  });
});

describe('OfficerHome active-test recovery card', () => {
  it('shows a visible Resume current test action and driver context', () => {
    const onResumeDraft = jest.fn();
    render(
      <OfficerHome
        {...baseProps}
        recoverableDraft={draft}
        onResumeDraft={onResumeDraft}
      />,
    );

    expect(screen.getByText('Resume current test')).toBeTruthy();
    expect(screen.getByText(/Jane Driver/)).toBeTruthy();
    fireEvent.press(screen.getByText('RESUME CURRENT TEST'));
    expect(onResumeDraft).toHaveBeenCalledTimes(1);
  });

  it('shows damaged-draft recovery with an explicit discard action', () => {
    const onDiscardDraft = jest.fn();
    render(
      <OfficerHome
        {...baseProps}
        draftRecoveryIssue={{
          message: 'The saved test draft is damaged.',
          updatedAt: '2026-09-24T10:05:00.000Z',
        }}
        onDiscardDraft={onDiscardDraft}
      />,
    );

    expect(screen.getByText('Saved test needs attention')).toBeTruthy();
    expect(screen.getByText('Discard')).toBeTruthy();
    fireEvent.press(screen.getByText('Discard'));
    expect(onDiscardDraft).toHaveBeenCalledTimes(1);
  });
});
