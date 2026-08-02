-- Case lifecycle workflow.
-- Supervisors work cases from queues: new → under_review → verified/referred/invalidated → closed.
-- tests rows stay immutable (WORM); the current case state lives here instead.

-- Existing annotations are the lifecycle history. Expand their legacy check
-- constraint so new lifecycle actions can be recorded without changing tests.
ALTER TABLE annotations DROP CONSTRAINT IF EXISTS annotations_status_check;
ALTER TABLE annotations ADD CONSTRAINT annotations_status_check CHECK (
  status IN ('pending', 'approved', 'new', 'under_review', 'verified', 'referred', 'invalidated', 'closed')
);

CREATE TABLE IF NOT EXISTS case_records (
  test_id TEXT PRIMARY KEY REFERENCES tests (id) ON DELETE CASCADE,
  case_status TEXT NOT NULL DEFAULT 'new' CHECK (
    case_status IN ('new', 'under_review', 'verified', 'referred', 'invalidated', 'closed')
  ),
  supervisor_email TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_records_status ON case_records (case_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_records_updated_at ON case_records (updated_at DESC);

-- Newly synced tests automatically enter the queue as 'new'.
CREATE OR REPLACE FUNCTION create_case_record_for_test()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO case_records (test_id, case_status)
  VALUES (NEW.id, 'new')
  ON CONFLICT (test_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_case_record_for_test ON tests;
CREATE TRIGGER trg_create_case_record_for_test
  AFTER INSERT ON tests
  FOR EACH ROW
  EXECUTE PROCEDURE create_case_record_for_test();

CREATE OR REPLACE FUNCTION set_case_record_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_case_records_updated_at ON case_records;
CREATE TRIGGER trg_case_records_updated_at
  BEFORE UPDATE ON case_records
  FOR EACH ROW
  EXECUTE PROCEDURE set_case_record_updated_at();
