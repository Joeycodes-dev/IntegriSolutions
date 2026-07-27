-- Officer onboarding invitations. Run this once in Supabase before using invite onboarding.
CREATE TABLE IF NOT EXISTS officer_invitations (
  id BIGSERIAL PRIMARY KEY,
  officer_id BIGINT NOT NULL REFERENCES officer_users(officer_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_email TEXT
);

CREATE INDEX IF NOT EXISTS idx_officer_invitations_officer_id ON officer_invitations(officer_id);
CREATE INDEX IF NOT EXISTS idx_officer_invitations_token_hash ON officer_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_officer_invitations_expires_at ON officer_invitations(expires_at);
