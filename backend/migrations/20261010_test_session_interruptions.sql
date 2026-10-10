-- Test session interruptions: an officer abandoned an in-progress roadside
-- test (licence scan / BAC reading) without saving a record.
--
-- Written from the mobile app's offline-first outbox (POST
-- /api/officers/session-interruptions) and read by supervisors on the web
-- portal (GET /api/supervisor/session-interruptions).
--
-- kind:
--   cancelled      - officer tapped Cancel/Abort and gave a reason
--   navigated_away - officer left the session screen via navigation and gave a reason
--   app_closed     - the app went to background/was closed mid-session (no reason possible)
--
-- `reason` is required for cancelled/navigated_away and always NULL for
-- app_closed. Officer identity is denormalized (name/badge at write time) so
-- supervisor lists never need joins and survive later profile edits.

CREATE TABLE IF NOT EXISTS test_session_interruptions (
  id TEXT PRIMARY KEY,
  officer_id INTEGER NOT NULL,
  officer_name TEXT NOT NULL,
  badge_number TEXT NOT NULL DEFAULT '',
  draft_id TEXT NOT NULL,
  planned_test_id TEXT,
  step TEXT NOT NULL CHECK (step IN ('scan', 'reading')),
  kind TEXT NOT NULL CHECK (kind IN ('cancelled', 'navigated_away', 'app_closed')),
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_session_interruptions_occurred_at
  ON test_session_interruptions (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_session_interruptions_officer
  ON test_session_interruptions (officer_id, occurred_at DESC);
