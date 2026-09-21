-- Phase A2: acknowledgement coverage, Critical non-acknowledgement awareness,
-- and resolution/cancellation reasons. Purely additive — no column is
-- dropped, no existing row is deleted, and 20260913's versioning/
-- re-acknowledgement foundation is untouched.

-- version_updated_at tracks when the alert's *current* version became
-- current — i.e. when the last material edit happened (see
-- computeMaterialChange in routes/supervisor/alerts.ts), as opposed to
-- updated_at, which also moves on non-material edits (a typo fix, a
-- priority decrease) and would otherwise make the Critical
-- non-acknowledgement awareness window drift for reasons that have nothing
-- to do with officers needing to see new content. Existing rows backfill to
-- created_at, since their current version has been "current" since issuance.
ALTER TABLE operational_alerts
  ADD COLUMN IF NOT EXISTS version_updated_at TIMESTAMPTZ;

UPDATE operational_alerts
  SET version_updated_at = created_at
  WHERE version_updated_at IS NULL;

ALTER TABLE operational_alerts
  ALTER COLUMN version_updated_at SET DEFAULT NOW();

ALTER TABLE operational_alerts
  ALTER COLUMN version_updated_at SET NOT NULL;

-- Resolution/cancellation reason: required by the backend whenever a
-- Supervisor transitions status to 'resolved' or 'cancelled' (see PATCH
-- /:id). Stored as plain, non-legal operational text — never a
-- determination about a person or vehicle. status_reason_by/at record who
-- made the call and when, independent of (and in addition to) the general
-- audit_logs trail.
ALTER TABLE operational_alerts
  ADD COLUMN IF NOT EXISTS status_reason TEXT;

ALTER TABLE operational_alerts
  ADD COLUMN IF NOT EXISTS status_reason_by TEXT;

ALTER TABLE operational_alerts
  ADD COLUMN IF NOT EXISTS status_reason_at TIMESTAMPTZ;
