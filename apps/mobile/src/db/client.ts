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
    receiptNumber TEXT,
    syncStatus TEXT NOT NULL DEFAULT 'pending_sync',
    createdAt TEXT NOT NULL,
    syncedAt TEXT,
    retryCount INTEGER NOT NULL DEFAULT 0,
    lastAttemptAt TEXT,
    lastError TEXT,
    photoUri TEXT,
    originalTestId TEXT,
    deviceTransport TEXT,
    deviceSerial TEXT,
    deviceCalibrationVersion TEXT,
    deviceCalibrationR0 REAL,
    deviceSessionPeakRaw REAL,
    deviceAvgRaw REAL,
    deviceRaw REAL,
    deviceCapturedAt TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tests_sync_status ON tests(syncStatus);
  CREATE INDEX IF NOT EXISTS idx_tests_created_at ON tests(createdAt);

  CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY NOT NULL,
    officerId INTEGER,
    ownerKey TEXT,
    driverData TEXT NOT NULL DEFAULT '',
    step TEXT NOT NULL DEFAULT 'scan',
    payloadVersion INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    createdAt TEXT NOT NULL,
    updatedAt TEXT
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

  CREATE TABLE IF NOT EXISTS evidence_attachments (
    id TEXT PRIMARY KEY NOT NULL,
    testId TEXT NOT NULL,
    category TEXT NOT NULL,
    uri TEXT NOT NULL,
    idempotencyKey TEXT,
    contentHash TEXT,
    syncStatus TEXT NOT NULL DEFAULT 'pending_sync',
    retryCount INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    syncedAt TEXT,
    lastAttemptAt TEXT,
    lastError TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_attachments_test ON evidence_attachments(testId);
  CREATE INDEX IF NOT EXISTS idx_attachments_sync ON evidence_attachments(syncStatus);

  CREATE TABLE IF NOT EXISTS alert_cache (
    id TEXT PRIMARY KEY NOT NULL,
    officerId INTEGER,
    version INTEGER NOT NULL DEFAULT 1,
    alertJson TEXT NOT NULL,
    receivedAt TEXT NOT NULL,
    acknowledgedAt TEXT,
    updatedAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_alert_cache_officer ON alert_cache(officerId);

  CREATE TABLE IF NOT EXISTS alert_ack_queue (
    alertId TEXT PRIMARY KEY NOT NULL,
    officerId INTEGER,
    requestedAt TEXT NOT NULL,
    retryCount INTEGER NOT NULL DEFAULT 0
  );

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

  const initialization = (async () => {
    const db = await SQLite.openDatabaseAsync('integiscan.db');
    await db.execAsync(SCHEMA);

    // Migrations for columns added after initial release
    for (const stmt of [
      'ALTER TABLE tests ADD COLUMN photoUri TEXT',
      'ALTER TABLE tests ADD COLUMN originalTestId TEXT',
      'ALTER TABLE tests ADD COLUMN deviceTransport TEXT',
      'ALTER TABLE tests ADD COLUMN deviceSerial TEXT',
      'ALTER TABLE tests ADD COLUMN deviceCalibrationVersion TEXT',
      'ALTER TABLE tests ADD COLUMN deviceCalibrationR0 REAL',
      'ALTER TABLE tests ADD COLUMN deviceSessionPeakRaw REAL',
      'ALTER TABLE tests ADD COLUMN deviceAvgRaw REAL',
      'ALTER TABLE tests ADD COLUMN deviceRaw REAL',
      'ALTER TABLE tests ADD COLUMN deviceCapturedAt TEXT',
      'ALTER TABLE tests ADD COLUMN lastAttemptAt TEXT',
      'ALTER TABLE tests ADD COLUMN lastError TEXT',
      'ALTER TABLE evidence_attachments ADD COLUMN lastAttemptAt TEXT',
      'ALTER TABLE evidence_attachments ADD COLUMN lastError TEXT',
      'ALTER TABLE drafts ADD COLUMN ownerKey TEXT',
      'ALTER TABLE tests ADD COLUMN receiptNumber TEXT',
      'ALTER TABLE evidence_attachments ADD COLUMN idempotencyKey TEXT',
      'ALTER TABLE evidence_attachments ADD COLUMN contentHash TEXT',
      'ALTER TABLE drafts ADD COLUMN payloadVersion INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE drafts ADD COLUMN status TEXT NOT NULL DEFAULT \'active\'',
      'ALTER TABLE drafts ADD COLUMN updatedAt TEXT'
    ]) {
      try {
        await db.runAsync(stmt);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/duplicate column name|already exists/i.test(message)) {
          throw error;
        }
      }
    }

    await db.runAsync(
      'CREATE INDEX IF NOT EXISTS idx_drafts_owner_updated ON drafts(ownerKey, updatedAt DESC)'
    );
    await db.runAsync(
      'CREATE INDEX IF NOT EXISTS idx_tests_receipt ON tests(receiptNumber)'
    );
    await db.runAsync(
      'CREATE INDEX IF NOT EXISTS idx_attachments_idempotency ON evidence_attachments(idempotencyKey)'
    );
    await db.runAsync(
      "UPDATE drafts SET ownerKey = 'officer:' || officerId WHERE officerId IS NOT NULL AND (ownerKey IS NULL OR ownerKey = '')"
    );
    await db.runAsync(
      'UPDATE drafts SET updatedAt = createdAt WHERE updatedAt IS NULL OR updatedAt = \'\''
    );

    dbInstance = db;
    return db;
  })();

  dbInitPromise = initialization.catch((error) => {
    dbInitPromise = null;
    throw error;
  });
  return dbInitPromise;
}

export async function closeDB(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
    dbInitPromise = null;
  }
}
