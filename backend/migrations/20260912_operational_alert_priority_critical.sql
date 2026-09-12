-- Extends operational_alerts.priority with a 'critical' tier, separating
-- true emergency/officer-safety/life-safety events from the existing
-- 'high' tier (which remains an urgent-but-non-emergency operational
-- priority — it is NOT renamed or repurposed).
--
-- Priority order after this migration: critical > high > medium > low.
--
-- This does not touch operational_alert_matches (it has no priority column
-- — a match always inherits its parent alert's priority) or any other
-- table. Existing 'high' | 'medium' | 'low' rows remain valid as-is; the
-- default stays 'medium'. This is purely additive to the allowed value
-- set, so no backfill/data migration is needed.
--
-- The original CHECK constraint was declared inline in
-- 20260910_operational_alerts.sql's CREATE TABLE (already applied — not
-- edited here), so Postgres auto-named it. Rather than assume that
-- generated name, this looks it up and drops whatever it actually is,
-- then adds a fresh, predictably-named constraint with 'critical' allowed.
DO $$
DECLARE
  existing_constraint_name text;
BEGIN
  SELECT con.conname INTO existing_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
  WHERE rel.relname = 'operational_alerts'
    AND con.contype = 'c'
    AND att.attname = 'priority';

  IF existing_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE operational_alerts DROP CONSTRAINT %I', existing_constraint_name);
  END IF;
END $$;

ALTER TABLE operational_alerts
  ADD CONSTRAINT operational_alerts_priority_check
    CHECK (priority IN ('critical', 'high', 'medium', 'low'));
