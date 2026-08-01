-- Officer duty status tracking.
-- Mirrors DUTY_STATUSES in backend/src/constants/dutyStatus.ts.
-- The mobile home screen duty pill persists into officer_users.duty_status,
-- and the supervisor Officers page reads it for live deployment status.

ALTER TABLE officer_users
  ADD COLUMN IF NOT EXISTS duty_status TEXT NOT NULL DEFAULT 'Off Duty'
  CHECK (duty_status IN ('On Patrol', 'Checkpoint', 'Break', 'Off Duty'));

CREATE INDEX IF NOT EXISTS idx_officer_users_duty_status
  ON officer_users (duty_status);
