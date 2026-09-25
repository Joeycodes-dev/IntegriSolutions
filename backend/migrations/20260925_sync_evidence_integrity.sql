-- Sync/evidence integrity metadata.
-- Records remain immutable; these columns are written only at insert time.

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS receipt_number TEXT;

-- Device custody fields are part of the record insert contract. They are
-- additive so existing immutable rows remain valid without a destructive
-- backfill.
ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS device_transport TEXT;

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS device_serial TEXT;

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS device_calibration_version TEXT;

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS device_calibration_r0 DOUBLE PRECISION;

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS device_session_peak_raw DOUBLE PRECISION;

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS device_avg_raw DOUBLE PRECISION;

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS device_raw DOUBLE PRECISION;

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS device_captured_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tests
    WHERE receipt_number IS NOT NULL
    GROUP BY receipt_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate test receipt numbers exist; resolve them before applying sync/evidence integrity constraints.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tests_receipt_number
  ON tests (receipt_number)
  WHERE receipt_number IS NOT NULL;

ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM evidence
    WHERE idempotency_key IS NOT NULL
    GROUP BY test_id, idempotency_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate evidence idempotency keys exist; resolve them before applying sync/evidence integrity constraints.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_test_idempotency
  ON evidence (test_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_content_hash
  ON evidence (content_hash)
  WHERE content_hash IS NOT NULL;
