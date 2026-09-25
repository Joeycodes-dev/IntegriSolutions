import { SyncCoordinator } from '../../src/lib/SyncCoordinator';

describe('SyncCoordinator', () => {
  it('runs sync tasks one at a time, including after a failure', async () => {
    const coordinator = new SyncCoordinator();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = coordinator.run(async () => {
      events.push('first:start');
      await firstGate;
      events.push('first:end');
      return 1;
    });
    const second = coordinator.run(async () => {
      events.push('second:start');
      return 2;
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst();
    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(2);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);

    await expect(
      coordinator.run(async () => {
        throw new Error('failed sync');
      }),
    ).rejects.toThrow('failed sync');
    await expect(coordinator.run(async () => 'recovered')).resolves.toBe('recovered');
  });
});
