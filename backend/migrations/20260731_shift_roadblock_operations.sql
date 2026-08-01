-- Roadblock / shift operations.
-- Supervisor-created roadblock shifts with officer assignments.

CREATE TABLE IF NOT EXISTS roadblock_shifts (
  id TEXT PRIMARY KEY,
  roadblock_name TEXT NOT NULL,
  station TEXT NOT NULL,
  supervisor_email TEXT NOT NULL,
  supervisor_name TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled', 'active', 'closed', 'cancelled')),
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_meters INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_roadblock_shifts_status_window
  ON roadblock_shifts (status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_roadblock_shifts_supervisor_email
  ON roadblock_shifts (supervisor_email);

CREATE TABLE IF NOT EXISTS roadblock_shift_officers (
  id BIGSERIAL PRIMARY KEY,
  shift_id TEXT NOT NULL REFERENCES roadblock_shifts (id) ON DELETE CASCADE,
  officer_id BIGINT NOT NULL REFERENCES officer_users (officer_id),
  assignment_status TEXT NOT NULL DEFAULT 'assigned' CHECK (assignment_status IN ('assigned', 'accepted', 'removed')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shift_id, officer_id)
);

CREATE INDEX IF NOT EXISTS idx_roadblock_shift_officers_officer_id
  ON roadblock_shift_officers (officer_id);
CREATE INDEX IF NOT EXISTS idx_roadblock_shift_officers_shift_id
  ON roadblock_shift_officers (shift_id);

CREATE OR REPLACE FUNCTION set_roadblock_shift_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roadblock_shifts_updated_at ON roadblock_shifts;
CREATE TRIGGER trg_roadblock_shifts_updated_at
  BEFORE UPDATE ON roadblock_shifts
  FOR EACH ROW
  EXECUTE PROCEDURE set_roadblock_shift_updated_at();