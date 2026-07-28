-- Run in Supabase SQL Editor so officer duty status stays in sync across mobile + web
ALTER TABLE officer_users
  ADD COLUMN IF NOT EXISTS duty_status TEXT NOT NULL DEFAULT 'Off Duty';

ALTER TABLE officer_users
  DROP CONSTRAINT IF EXISTS officer_users_duty_status_check;

ALTER TABLE officer_users
  ADD CONSTRAINT officer_users_duty_status_check
  CHECK (duty_status IN ('On Patrol', 'Checkpoint', 'Break', 'Off Duty'));

COMMENT ON COLUMN officer_users.duty_status IS 'Live deployment status set by the officer on mobile; shown on supervisor Officers screen';
