import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { SyncStatusBar } from '../../src/components/SyncStatusBar';

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

const lastSyncedAt = new Date('2026-09-24T18:00:00Z');

/** A completed run that actually moved work — worth announcing. */
function run(
  overrides: Partial<NonNullable<React.ComponentProps<typeof SyncStatusBar>['lastRun']>> = {},
) {
  return {
    status: 'success' as const,
    message: 'Uploaded.',
    startedAt: '2026-09-24T19:00:00.000Z',
    finishedAt: '2026-09-24T19:00:01.000Z',
    attempted: 1,
    uploaded: 1,
    duplicates: 0,
    failed: 0,
    deferred: 0,
    evidenceUploaded: 0,
    evidencePending: 0,
    evidenceFailed: 0,
    alertsSynced: 0,
    ...overrides,
  };
}

/** A background poll that found nothing to do — must stay silent. */
function idleRun(finishedAt: string) {
  return run({
    status: 'success' as const,
    message: 'Everything on this device is up to date.',
    attempted: 0,
    uploaded: 0,
    finishedAt,
  });
}

function baseProps(overrides: Partial<React.ComponentProps<typeof SyncStatusBar>> = {}) {
  return {
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    lastSyncedAt,
    onSyncNow: jest.fn(),
    onOpenSyncCentre: jest.fn(),
    ...overrides,
  };
}

/**
 * Drives the auto-dismiss timer and flushes the fade-out that follows it.
 * Collapsing schedules the unmount a frame after the dismiss fires, so callers
 * that want the panel fully gone need to overrun the dismiss window slightly.
 */
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function advancePastDismiss() {
  await advance(5_000);
  await advance(300);
}

describe('SyncStatusBar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps a compact always-visible status strip', () => {
    render(<SyncStatusBar {...baseProps()} />);

    // The collapsed strip is permanent — the original complaint was that sync
    // was impossible to find behind an unlabelled icon.
    expect(screen.getByText('Synced')).toBeTruthy();
    // The expanded panel stays out of the way on a quiet, unchanged state.
    expect(screen.queryByText('SYNC NOW')).toBeNull();
    expect(screen.queryByText('Sync Centre')).toBeNull();
  });

  it('does not flash a banner on first render', () => {
    render(<SyncStatusBar {...baseProps({ pendingCount: 2 })} />);

    // Nothing has actually happened yet, so no transient panel interrupts.
    expect(screen.getByText('2 pending')).toBeTruthy();
    expect(screen.queryByText('SYNC NOW')).toBeNull();
  });

  it('expands on a sync event and then auto-dismisses', async () => {
    const props = baseProps({ pendingCount: 1, lastRun: run() });
    const { rerender } = render(<SyncStatusBar {...props} />);

    // First render must stay silent even with an announceable run in hand.
    expect(screen.queryByText('SYNC NOW')).toBeNull();

    // A later run actually uploaded something.
    await act(async () => {
      rerender(
        <SyncStatusBar
          {...props}
          pendingCount={0}
          lastRun={run({ finishedAt: '2026-09-24T19:00:11.000Z' })}
        />,
      );
    });

    expect(screen.getByText('All records and evidence synced')).toBeTruthy();
    expect(screen.getByText('SYNC NOW')).toBeTruthy();
    expect(screen.getByText('Sync Centre')).toBeTruthy();

    // Then it gets out of the way again.
    await advancePastDismiss();
    expect(screen.queryByText('SYNC NOW')).toBeNull();
  });

  it('stays silent across repeated background polls that do nothing', async () => {
    const props = baseProps();
    const { rerender } = render(<SyncStatusBar {...props} />);

    // Ten seconds of polling, each run a no-op. This is the regression that
    // made the banner fire constantly.
    for (let poll = 0; poll < 6; poll += 1) {
      await act(async () => {
        rerender(
          <SyncStatusBar
            {...props}
            isSyncing
            lastRun={idleRun(`2026-09-24T19:00:0${poll}.000Z`)}
          />,
        );
      });
      await act(async () => {
        rerender(
          <SyncStatusBar
            {...props}
            isSyncing={false}
            lastRun={idleRun(`2026-09-24T19:00:1${poll}.000Z`)}
          />,
        );
      });
      expect(screen.queryByText('SYNC NOW')).toBeNull();
    }
  });

  it('ignores transient self-resolving states', async () => {
    const props = baseProps();
    const { rerender } = render(<SyncStatusBar {...props} />);

    for (const [index, status] of (['deferred', 'rate_limited', 'offline'] as const).entries()) {
      await act(async () => {
        rerender(
          <SyncStatusBar
            {...props}
            lastRun={run({
              status,
              uploaded: 0,
              attempted: 0,
              deferred: 1,
              finishedAt: `2026-09-24T19:00:2${index}.000Z`,
            })}
          />,
        );
      });
      // These retry on their own; repeating them every poll is pure noise.
      expect(screen.queryByText('SYNC NOW')).toBeNull();
    }
  });

  it('always surfaces an expired session, since sync cannot proceed', async () => {
    const props = baseProps();
    const { rerender } = render(<SyncStatusBar {...props} />);

    await act(async () => {
      rerender(
        <SyncStatusBar
          {...props}
          lastRun={run({
            status: 'auth_required',
            uploaded: 0,
            attempted: 0,
            message: 'Sign in to upload queued records and evidence.',
            finishedAt: '2026-09-24T19:00:31.000Z',
          })}
        />,
      );
    });

    expect(screen.getByText('SYNC NOW')).toBeTruthy();
  });

  it('re-expands when a further sync event lands', async () => {
    const props = baseProps({ pendingCount: 1 });
    const { rerender } = render(<SyncStatusBar {...props} />);

    await act(async () => {
      rerender(
        <SyncStatusBar
          {...props}
          pendingCount={0}
          lastRun={run({ finishedAt: '2026-09-24T19:01:01.000Z' })}
        />,
      );
    });
    await advancePastDismiss();
    expect(screen.queryByText('SYNC NOW')).toBeNull();

    await act(async () => {
      rerender(
        <SyncStatusBar
          {...props}
          pendingCount={2}
          lastRun={run({
            uploaded: 2,
            attempted: 2,
            finishedAt: '2026-09-24T19:01:31.000Z',
          })}
        />,
      );
    });

    expect(screen.getByText('2 items waiting to sync')).toBeTruthy();
    expect(screen.getByText('SYNC NOW')).toBeTruthy();
  });

  it('announces each run at most once', async () => {
    const props = baseProps({ pendingCount: 1 });
    const sameRun = run({ finishedAt: '2026-09-24T19:02:01.000Z' });
    const { rerender } = render(<SyncStatusBar {...props} lastRun={sameRun} />);

    await act(async () => {
      rerender(<SyncStatusBar {...props} pendingCount={0} lastRun={sameRun} />);
    });
    await advancePastDismiss();
    expect(screen.queryByText('SYNC NOW')).toBeNull();

    // The identical run re-rendering must not resurrect the banner.
    await act(async () => {
      rerender(<SyncStatusBar {...props} pendingCount={0} lastRun={sameRun} />);
    });
    expect(screen.queryByText('SYNC NOW')).toBeNull();
  });

  it('pins open when expanded by hand, and honours an explicit collapse', async () => {
    render(<SyncStatusBar {...baseProps({ pendingCount: 3 })} />);

    fireEvent.press(screen.getByLabelText('Expand sync status'));
    expect(screen.getByText('SYNC NOW')).toBeTruthy();

    // A timer must never yank the panel away while it is being read or tapped.
    await advance(20_000);
    expect(screen.getByText('SYNC NOW')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Collapse sync status'));
    await advance(500);
    expect(screen.queryByText('SYNC NOW')).toBeNull();
  });

  it('never reports synced while work is waiting or failed', () => {
    const { rerender } = render(<SyncStatusBar {...baseProps({ pendingCount: 2 })} />);
    expect(screen.getByText('2 pending')).toBeTruthy();
    expect(screen.queryByText('Synced')).toBeNull();

    rerender(<SyncStatusBar {...baseProps({ pendingCount: 1, failedCount: 2 })} />);
    expect(screen.getByText('2 failed')).toBeTruthy();
    expect(screen.queryByText('Synced')).toBeNull();
  });

  it('reports failed items as needing attention once expanded', async () => {
    const props = baseProps({ failedCount: 1 });
    const { rerender } = render(<SyncStatusBar {...props} />);

    await act(async () => {
      rerender(
        <SyncStatusBar
          {...props}
          failedCount={2}
          lastRun={run({
            status: 'partial' as const,
            uploaded: 0,
            attempted: 2,
            failed: 2,
            message: '2 records need attention.',
            finishedAt: '2026-09-24T19:03:01.000Z',
          })}
        />,
      );
    });

    expect(screen.getByText('2 items failed to sync')).toBeTruthy();
    expect(screen.getByText(/Open Sync Centre to see what went wrong/)).toBeTruthy();
  });

  it('announces an in-progress sync run', () => {
    render(<SyncStatusBar {...baseProps({ isSyncing: true, pendingCount: 2 })} />);
    expect(screen.getByText('Syncing…')).toBeTruthy();
  });

  it('routes Sync Centre and Sync now from the expanded panel', async () => {
    const props = baseProps({ pendingCount: 1 });
    render(<SyncStatusBar {...props} />);

    fireEvent.press(screen.getByLabelText('Expand sync status'));

    fireEvent.press(screen.getByText('Sync Centre'));
    expect(props.onOpenSyncCentre).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText('SYNC NOW'));
    expect(props.onSyncNow).toHaveBeenCalledTimes(1);
  });

  it('opens and pins the panel when the officer taps Sync now directly', () => {
    const props = baseProps({ pendingCount: 2 });
    render(<SyncStatusBar {...props} />);

    // Tapping sync on the collapsed strip is deliberate feedback, so it must
    // report the outcome rather than staying silent.
    fireEvent.press(screen.getByLabelText('Sync now — upload pending records and evidence'));
    expect(props.onSyncNow).toHaveBeenCalledTimes(1);
    expect(screen.getByText('SYNC NOW')).toBeTruthy();
    expect(screen.getByText('Pinned open — tap the arrow to collapse')).toBeTruthy();
  });
});
