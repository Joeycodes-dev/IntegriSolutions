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
  pendingEvidenceCount: 0,
  failedCount: 0,
  failedEvidenceCount: 0,
  syncedCount: 0,
  todayCount: 0,
  weekCount: 0,
  recentStops: [],
  isSyncing: false,
  lastSyncedAt: null,
  onStartSession: jest.fn(),
  onOpenRoadOffence: jest.fn(),
  onForceSync: jest.fn(),
  onOpenReports: jest.fn(),
  onOpenAudit: jest.fn(),
};

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
