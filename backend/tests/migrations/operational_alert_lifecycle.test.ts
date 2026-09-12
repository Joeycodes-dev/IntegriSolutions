import fs from 'fs';
import path from 'path';

/**
 * This migration (20260913_operational_alert_lifecycle.sql) is the
 * highest-risk schema change in the Phase A1 batch: it widens the
 * acknowledgements table's primary key on a table that may already hold
 * production data. There is no real Postgres instance available to this
 * test suite (all route tests run against a mocked supabase-js client), so
 * "migration safety" is verified the same way it is exercised — by
 * asserting the SQL text itself follows the safe, additive, non-destructive
 * pattern the batch requires, matching the technique already used (and
 * already applied in production) in 20260912_operational_alert_priority_critical.sql.
 */
describe('operational_alert_lifecycle migration', () => {
  const migrationPath = path.join(
    __dirname,
    '../../migrations/20260913_operational_alert_lifecycle.sql'
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('adds operational_alerts.version defaulting existing rows to 1, without destroying data', () => {
    expect(sql).toMatch(/ALTER TABLE operational_alerts\s+ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1/i);
  });

  it('adds operational_alert_acknowledgements.alert_version defaulting existing rows to 1', () => {
    expect(sql).toMatch(
      /ALTER TABLE operational_alert_acknowledgements\s+ADD COLUMN IF NOT EXISTS alert_version INTEGER NOT NULL DEFAULT 1/i
    );
  });

  it('never drops or truncates acknowledgement data', () => {
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    expect(sql).not.toMatch(/DELETE FROM operational_alert_acknowledgements/i);
  });

  it('looks up the existing primary key constraint name via pg_constraint rather than assuming it', () => {
    // Mirrors the safe DO-block pattern from 20260912_operational_alert_priority_critical.sql:
    // find whatever the auto-generated constraint is actually called, then drop *that* name.
    expect(sql).toMatch(/SELECT\s+con\.conname\s+INTO\s+existing_pk_name/i);
    expect(sql).toMatch(/FROM\s+pg_constraint\s+con/i);
    expect(sql).toMatch(/con\.contype\s*=\s*'p'/i);
    expect(sql).toMatch(/EXECUTE format\('ALTER TABLE operational_alert_acknowledgements DROP CONSTRAINT %I', existing_pk_name\)/i);
  });

  it('re-adds the primary key widened to (alert_id, officer_id, alert_version)', () => {
    expect(sql).toMatch(
      /ADD CONSTRAINT operational_alert_acknowledgements_pkey\s+PRIMARY KEY \(alert_id, officer_id, alert_version\)/i
    );
  });

  it('only touches operational_alerts and operational_alert_acknowledgements — no unrelated table changes', () => {
    const alterStatements = sql.match(/ALTER TABLE (\w+)/gi) ?? [];
    const touchedTables = new Set(alterStatements.map((s) => s.replace(/ALTER TABLE /i, '')));
    expect(touchedTables).toEqual(new Set(['operational_alerts', 'operational_alert_acknowledgements']));
  });

  it('is purely additive: uses ADD COLUMN/ADD CONSTRAINT/CREATE INDEX, never DROP COLUMN', () => {
    expect(sql).not.toMatch(/DROP COLUMN/i);
  });
});
