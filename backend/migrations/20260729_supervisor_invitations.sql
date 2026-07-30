-- Supervisor onboarding invitations. Run after core schema before using admin supervisor onboarding.
CREATE TABLE IF NOT EXISTS supervisor_invitations (
  id BIGSERIAL PRIMARY KEY,
  supervisor_id BIGINT NOT NULL REFERENCES supervisor_users(supervisor_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_email TEXT
);

CREATE INDEX IF NOT EXISTS idx_supervisor_invitations_supervisor_id ON supervisor_invitations(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_invitations_token_hash ON supervisor_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_supervisor_invitations_expires_at ON supervisor_invitations(expires_at);