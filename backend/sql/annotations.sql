-- Supervisor Evidence Review annotations.
-- Prefer running backend/migrations/20260728_evidence_annotations_audit.sql (includes this).

CREATE TABLE IF NOT EXISTS annotations (
  id BIGSERIAL PRIMARY KEY,
  test_id TEXT NOT NULL,
  supervisor_email TEXT NOT NULL,
  comment TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'referred')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_annotations_test_id ON annotations (test_id);
CREATE INDEX IF NOT EXISTS idx_annotations_created_at ON annotations (created_at DESC);
