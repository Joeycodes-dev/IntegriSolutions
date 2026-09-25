export type SyncTask<T> = () => Promise<T>;

/**
 * Serializes every local sync request. SQLite/network work can be triggered by
 * the dashboard, Sync Centre, network recovery, and post-save hooks at the
 * same time; a single tail prevents overlapping retries and duplicate uploads.
 */
export class SyncCoordinator {
  private tail: Promise<void> = Promise.resolve();

  run<T>(task: SyncTask<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export const syncCoordinator = new SyncCoordinator();
