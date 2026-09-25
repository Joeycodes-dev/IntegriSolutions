import React from 'react';
import { Share } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SyncCentreModal } from '../../src/components/SyncCentreModal';
import { styles as syncCentreStyles } from '../../src/components/SyncCentreModal.styles';

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null
}));

const mockSyncContext = {
  pendingCount: 1,
  failedCount: 1,
  syncedCount: 8,
  pendingEvidenceCount: 1,
  failedEvidenceCount: 1,
  syncedEvidenceCount: 4,
  queuedAlertCount: 0,
  todayCount: 2,
  weekCount: 5,
  recentTests: [],
  isSyncing: false,
  networkStatus: 'online' as const,
  lastSyncedAt: new Date('2026-09-24T18:00:00Z'),
  lastAttemptAt: new Date('2026-09-24T19:00:00Z'),
  lastRun: {
    status: 'partial' as string,
    message: '1 record needs attention.',
    startedAt: '2026-09-24T19:00:00Z',
    finishedAt: '2026-09-24T19:00:01Z',
    attempted: 1,
    uploaded: 0,
    duplicates: 0,
    failed: 1,
    deferred: 0,
    evidenceUploaded: 0,
    evidencePending: 0,
    evidenceFailed: 0,
    alertsSynced: 0
  },
  databaseError: null,
  syncNow: jest.fn(),
  retryFailed: jest.fn(),
  retryRecord: jest.fn(),
  retryEvidence: jest.fn(),
  forceSync: jest.fn(),
  refreshCounts: jest.fn()
};

jest.mock('../../src/lib/SyncContext', () => ({
  useSync: () => mockSyncContext
}));

jest.mock('../../src/lib/AuthContext', () => ({
  useAuth: () => ({ profile: { officerId: 1, name: 'Officer One' } })
}));

jest.mock('../../src/db/repository', () => ({
  getAuditEventsByAction: jest.fn(),
  getFailedSync: jest.fn(),
  getPendingSync: jest.fn(),
  getSyncEvidenceAttachments: jest.fn(),
  resetAttachmentToPending: jest.fn(),
  retryFailedSyncRecord: jest.fn()
}));

const repository = jest.requireMock('../../src/db/repository');

const failedRecord = {
  id: 'record-1234567890',
  officerId: 1,
  officerName: 'Officer One',
  badgeNumber: 'B001',
  driverName: 'Sensitive Driver Name',
  driverId: 'DL001',
  driverDob: '1990-01-01',
  bacReading: 0.081,
  result: 'fail',
  location: '{}',
  hash: 'hash',
  syncStatus: 'failed' as const,
  createdAt: '2026-09-24T18:30:00Z',
  syncedAt: null,
  retryCount: 5,
  lastAttemptAt: '2026-09-24T19:00:00Z',
  lastError: 'Server rejected the custody record: hash mismatch',
  photoUri: null,
  originalTestId: null
};

const pendingRecord = {
  ...failedRecord,
  id: 'pending-0987654321',
  syncStatus: 'pending_sync' as const,
  retryCount: 1,
  lastError: 'Network error requesting /sync',
  result: 'pass' as const
};

const failedEvidence = {
  id: 'evidence-1234567890',
  testId: 'record-1234567890',
  category: 'licence_front',
  uri: 'file:///licence.jpg',
  syncStatus: 'failed' as const,
  retryCount: 5,
  createdAt: '2026-09-24T18:31:00Z',
  syncedAt: null,
  lastAttemptAt: '2026-09-24T19:00:00Z',
  lastError: 'Photo is larger than the 5 MB limit',
  parentSyncStatus: 'synced' as const,
  parentCreatedAt: '2026-09-24T18:30:00Z'
};

const pendingEvidence = {
  ...failedEvidence,
  id: 'evidence-0987654321',
  testId: 'pending-0987654321',
  syncStatus: 'pending_sync' as const,
  lastError: null,
  parentSyncStatus: 'pending_sync' as const
};

function summary(overrides: Record<string, unknown> = {}) {
  return {
    status: 'success',
    message: 'Sync completed.',
    startedAt: '2026-09-24T19:01:00Z',
    finishedAt: '2026-09-24T19:01:01Z',
    attempted: 1,
    uploaded: 1,
    duplicates: 0,
    failed: 0,
    deferred: 0,
    evidenceUploaded: 0,
    evidencePending: 0,
    evidenceFailed: 0,
    alertsSynced: 0,
    ...overrides
  };
}

function renderModal(onClose = jest.fn(), onSignIn?: () => void) {
  return render(
    <SafeAreaProvider>
      <SyncCentreModal
        visible
        onClose={onClose}
        onViewAudit={jest.fn()}
        onViewReports={jest.fn()}
        onSignIn={onSignIn}
      />
    </SafeAreaProvider>
  );
}

describe('SyncCentreModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSyncContext.pendingCount = 1;
    mockSyncContext.failedCount = 1;
    mockSyncContext.syncedCount = 8;
    mockSyncContext.pendingEvidenceCount = 1;
    mockSyncContext.failedEvidenceCount = 1;
    mockSyncContext.syncedEvidenceCount = 4;
    mockSyncContext.isSyncing = false;
    mockSyncContext.networkStatus = 'online';
    mockSyncContext.lastRun = {
      status: 'partial',
      message: '1 record needs attention.',
      startedAt: '2026-09-24T19:00:00Z',
      finishedAt: '2026-09-24T19:00:01Z',
      attempted: 1,
      uploaded: 0,
      duplicates: 0,
      failed: 1,
      deferred: 0,
      evidenceUploaded: 0,
      evidencePending: 0,
      evidenceFailed: 0,
      alertsSynced: 0
    };
    mockSyncContext.syncNow.mockResolvedValue(summary());
    mockSyncContext.retryFailed.mockResolvedValue(summary());
     mockSyncContext.retryRecord.mockResolvedValue(summary());
     mockSyncContext.retryEvidence.mockResolvedValue(summary());
    mockSyncContext.refreshCounts.mockResolvedValue(undefined);
    repository.getFailedSync.mockResolvedValue([failedRecord]);
    repository.getPendingSync.mockResolvedValue([pendingRecord]);
    repository.getSyncEvidenceAttachments.mockResolvedValue([failedEvidence, pendingEvidence]);
    repository.getAuditEventsByAction.mockResolvedValue([]);
    repository.resetAttachmentToPending.mockResolvedValue(undefined);
    repository.retryFailedSyncRecord.mockResolvedValue(undefined);
  });

  it('opens as a tall, centred four-tab console with an internal status gap', async () => {
    renderModal();

    expect(screen.getByText('Sync centre')).toBeTruthy();
    expect(syncCentreStyles.sheet.height).toBe('94%');
    expect(syncCentreStyles.overlay.justifyContent).toBe('center');
    expect(syncCentreStyles.statusHero.marginTop).toBe(12);
    expect(screen.getByLabelText('Overview sync tab')).toBeTruthy();
    expect(screen.getByLabelText('Records sync tab')).toBeTruthy();
    expect(screen.getByLabelText('Evidence sync tab')).toBeTruthy();
    expect(screen.getByLabelText('Activity sync tab')).toBeTruthy();
    expect(screen.getByText('Action required')).toBeTruthy();

    await waitFor(() => {
      expect(repository.getFailedSync).toHaveBeenCalledWith(1);
      expect(repository.getPendingSync).toHaveBeenCalledWith(1);
      expect(repository.getSyncEvidenceAttachments).toHaveBeenCalledWith(1);
      expect(repository.getAuditEventsByAction).toHaveBeenCalledWith('sync', 50);
      expect(repository.getAuditEventsByAction).toHaveBeenCalledWith('alert.acknowledged', 20);
    });
  });

  it('shows failed record reasons and retries one immutable record', async () => {
    renderModal();

    fireEvent.press(screen.getByLabelText('Records sync tab'));

    expect(await screen.findByText('Integrity check failed')).toBeTruthy();
    expect(screen.getByText(/Do not edit or delete this record/)).toBeTruthy();
    expect(screen.getByText(/Reported: Server rejected the custody record/)).toBeTruthy();
    expect(screen.getByText('5 attempts')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Retry test record-1…7890'));

    await waitFor(() => {
      expect(mockSyncContext.retryRecord).toHaveBeenCalledWith('record-1234567890');
      expect(mockSyncContext.syncNow).not.toHaveBeenCalled();
    });
  });

  it('shows evidence errors and explains parent-record gating', async () => {
    renderModal();

    fireEvent.press(screen.getByLabelText('Evidence sync tab'));

    expect((await screen.findAllByText('Licence Front')).length).toBe(2);
    expect(screen.getByText(/Photo is larger than the 5 MB limit/)).toBeTruthy();
    expect(screen.getByText('Waiting for parent record')).toBeTruthy();
    expect(screen.getByLabelText('Retry Licence Front')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Retry Licence Front'));
    await waitFor(() => {
      expect(mockSyncContext.retryEvidence).toHaveBeenCalledWith('evidence-1234567890');
      expect(mockSyncContext.syncNow).not.toHaveBeenCalled();
    });
  });

  it('offers a direct sign-in recovery action when the session expired', async () => {
    mockSyncContext.lastRun.status = 'auth_required';
    mockSyncContext.lastRun.message = 'Sign in to upload queued records and evidence.';
    const onSignIn = jest.fn();
    renderModal(jest.fn(), onSignIn);

    await waitFor(() => {
      expect(screen.queryByText('Reading local sync queue…')).toBeNull();
    });
    fireEvent.press(screen.getByLabelText('Sign in again to resume syncing'));

    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('shares diagnostics without driver details or location data', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({
      action: 'sharedAction'
    } as never);

    renderModal();
    await waitFor(() => {
      expect(screen.queryByText('Reading local sync queue…')).toBeNull();
    });
    fireEvent.press(screen.getByLabelText('Activity sync tab'));
    fireEvent.press(screen.getByText('Share sync report'));

    await waitFor(() => expect(share).toHaveBeenCalled());
    const report = share.mock.calls[0][0].message as string;
    expect(report).toContain('IntegriScan sync diagnostics');
    expect(report).toContain('record-1…7890');
    expect(report).not.toContain('Sensitive Driver Name');
    expect(report).not.toContain('DL001');
    expect(report).not.toContain('file:///licence.jpg');
    share.mockRestore();
  });
});
