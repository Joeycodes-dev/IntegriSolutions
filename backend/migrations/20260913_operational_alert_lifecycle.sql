-- Phase A1: alert versioning for material-update re-acknowledgement.
--
-- operational_alerts.version starts at 1 and is incremented by the backend
-- only when a Supervisor PATCH is classified as a "material" change (see
-- computeMaterialChange() in routes/supervisor/alerts.ts) — e.g. a priority
-- increase, a target/shift/officer change, a location/radius change, a
-- source authority/reference change, or a description edit the Supervisor
-- has explicitly flagged as changing operational meaning. A non-material
-- edit (typo fix, formatting, priority decrease, a minor expiry correction)
-- leaves version untouched.
--
-- operational_alert_acknowledgements gets a matching alert_version column so
-- an officer's acknowledgement is recorded against the specific version they
-- saw. Historical acknowledgements are never deleted or overwritten — a
-- material update simply means the officer has not yet acknowledged the
-- NEW version, so they naturally reappear as unacknowledged (same
-- acknowledgedAt-is-null path the app already uses today; no new client
-- logic needed).
--
-- Existing rows default to version 1 / alert_version 1, so every
-- already-issued alert and every already-recorded acknowledgement remains
-- exactly as valid (and exactly as "acknowledged") as it was before this
-- migration — nothing is invalidated by applying it.

ALTER TABLE operational_alerts
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE operational_alert_acknowledgements
  ADD COLUMN IF NOT EXISTS alert_version INTEGER NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- Widen the acknowledgement primary key from (alert_id, officer_id) to
-- (alert_id, officer_id, alert_version), so the same officer can hold one
-- acknowledgement row per version of the same alert (v1, v2, ...) without
-- destroying earlier ones. The original PK was declared inline in
-- 20260910_operational_alerts.sql's CREATE TABLE (already applied — not
-- edited here), so Postgres auto-named it. Rather than assume that name,
-- this looks it up via pg_constraint (same safe technique already used in
-- 20260912_operational_alert_priority_critical.sql) and drops whatever it
-- actually is before adding the new one. No rows are deleted at any point.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  existing_pk_name text;
BEGIN
  SELECT con.conname INTO existing_pk_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'operational_alert_acknowledgements'
    AND con.contype = 'p';

  IF existing_pk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE operational_alert_acknowledgements DROP CONSTRAINT %I', existing_pk_name);
  END IF;
END $$;

ALTER TABLE operational_alert_acknowledgements
  ADD CONSTRAINT operational_alert_acknowledgements_pkey
    PRIMARY KEY (alert_id, officer_id, alert_version);

-- Existing (alert_id, officer_id) pairs are still guaranteed unique once
-- alert_version defaults to 1 for all of them, so this PK swap cannot fail
-- or drop data on an already-populated table.

-- Helpful for "all acknowledgements for officer X, across whichever alerts"
-- style lookups (GET /alerts/active already filters by officer_id) — the PK
-- itself leads with alert_id, so this complements it rather than duplicating it.
CREATE INDEX IF NOT EXISTS idx_operational_alert_acks_officer
  ON operational_alert_acknowledgements (officer_id);
