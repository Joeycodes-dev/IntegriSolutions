-- Court verification portal: opaque per-export verification tokens for PDF QR codes.
-- Each PDF export receives fresh high-entropy tokens; links are valid forever unless revoked.
-- tests rows stay immutable (WORM); tokens live in their own side table.

CREATE TABLE IF NOT EXISTS court_verification_tokens (
  id BIGSERIAL PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES tests (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  issued_by TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_court_verification_tokens_hash ON court_verification_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_court_verification_tokens_test_id ON court_verification_tokens (test_id, issued_at DESC);

-- Only the backend service role may read/write; anonymous access is denied by RLS.
ALTER TABLE court_verification_tokens ENABLE ROW LEVEL SECURITY;
