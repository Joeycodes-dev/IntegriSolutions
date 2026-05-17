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
    retryCount INTEGER NOT NULL DEFAULT 0
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
