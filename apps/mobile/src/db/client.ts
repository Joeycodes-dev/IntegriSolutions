import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA = `
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS tests (
    id TEXT PRIMARY KEY NOT NULL,
    officerId INTEGER,
    officerName TEXT NOT NULL,
    badgeNumber TEXT NOT NULL,
    driverName TEXT NOT NULL,
    driverId TEXT NOT NULL,
    driverDob TEXT NOT NULL DEFAULT '',
    bacReading REAL NOT NULL,
    result TEXT NOT NULL,
    location TEXT NOT NULL,
    hash TEXT NOT NULL,
    syncStatus TEXT NOT NULL DEFAULT 'pending_sync',
    createdAt TEXT NOT NULL,
    syncedAt TEXT,
    retryCount INTEGER NOT NULL DEFAULT 0,
    photoUri TEXT,
    originalTestId TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tests_sync_status ON tests(syncStatus);
  CREATE INDEX IF NOT EXISTS idx_tests_created_at ON tests(createdAt);

  CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY NOT NULL,
    officerId INTEGER,
    driverData TEXT NOT NULL DEFAULT '',
    step TEXT NOT NULL DEFAULT 'scan',
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY NOT NULL,
    occurredAt TEXT NOT NULL,
    officerId INTEGER,
    officerName TEXT,
    badgeNumber TEXT,
    action TEXT NOT NULL,
    entityType TEXT,
    entityId TEXT,
    outcome TEXT NOT NULL,
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_audit_occurred_at ON audit_events(occurredAt);
  CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action);
  CREATE INDEX IF NOT EXISTS idx_audit_officer ON audit_events(officerId);

  CREATE TRIGGER IF NOT EXISTS audit_no_update
  BEFORE UPDATE ON audit_events
  BEGIN
    SELECT RAISE(ABORT, 'audit_events is append-only');
  END;

  CREATE TRIGGER IF NOT EXISTS audit_no_delete
  BEFORE DELETE ON audit_events
  BEGIN
    SELECT RAISE(ABORT, 'audit_events is append-only');
  END;
`;

export async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = (async () => {
    const db = await SQLite.openDatabaseAsync('integiscan.db');
    await db.execAsync(SCHEMA);

    // Migrations for columns added after initial release
    for (const stmt of [
      'ALTER TABLE tests ADD COLUMN photoUri TEXT',
      'ALTER TABLE tests ADD COLUMN originalTestId TEXT'
    ]) {
      try { await db.runAsync(stmt); } catch { /* column already exists */ }
    }

    dbInstance = db;
    return db;
  })();

  return dbInitPromise;
}

export async function closeDB(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
    dbInitPromise = null;
  }
}
