-- Core IntegriScan schema (users, immutable tests, invalidations, settings).
-- Run in Supabase SQL Editor AFTER feature migrations.
-- Order:
--   1) 20260729_core_schema.sql  (this file)
--   2) 20260729_admin_users.sql
--   3) 20260719_officer_invitations.sql
--   4) 20260729_supervisor_invitations.sql
--   5) 20260728_evidence_annotations_audit.sql

-- ---------------------------------------------------------------------------
-- Role reference and profile tables
--   1 = Officer, 2 = Supervisor, 3 = Admin
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS officer_users (
  officer_id BIGSERIAL PRIMARY KEY,
  officer_email_address TEXT NOT NULL UNIQUE,
  officer_name TEXT NOT NULL,
  officer_surname TEXT NOT NULL,
  officer_id_number BIGINT NOT NULL,
  badge_number TEXT NOT NULL,
  officer_employment_status TEXT NOT NULL DEFAULT 'Active',
  province TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  officer_type_id INTEGER NOT NULL DEFAULT 1,
  role_id INTEGER NOT NULL DEFAULT 1 CHECK (role_id = 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_officer_users_email ON officer_users (officer_email_address);
CREATE INDEX IF NOT EXISTS idx_officer_users_role ON officer_users (role_id);
CREATE INDEX IF NOT EXISTS idx_officer_users_status ON officer_users (officer_employment_status);

CREATE TABLE IF NOT EXISTS supervisor_users (
  supervisor_id BIGSERIAL PRIMARY KEY,
  supervisor_email_address TEXT NOT NULL UNIQUE,
  supervisor_name TEXT NOT NULL,
  supervisor_surname TEXT NOT NULL,
  supervisor_id_number BIGINT NOT NULL,
  badge_number TEXT NOT NULL,
  employment_status TEXT NOT NULL DEFAULT 'Active',
  province TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  officer_type_id INTEGER NOT NULL DEFAULT 1,
  role_id INTEGER NOT NULL DEFAULT 2 CHECK (role_id = 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supervisor_users_email ON supervisor_users (supervisor_email_address);
CREATE INDEX IF NOT EXISTS idx_supervisor_users_status ON supervisor_users (employment_status);

CREATE TABLE IF NOT EXISTS admin_users (
  admin_id BIGSERIAL PRIMARY KEY,
  admin_email_address TEXT NOT NULL UNIQUE,
  admin_name TEXT NOT NULL,
  admin_surname TEXT NOT NULL,
  admin_id_number BIGINT NOT NULL,
  badge_number TEXT NOT NULL,
  employment_status TEXT NOT NULL DEFAULT 'Active',
  province TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  officer_type_id INTEGER NOT NULL DEFAULT 1,
  role_id INTEGER NOT NULL DEFAULT 3 CHECK (role_id = 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users (admin_email_address);
CREATE INDEX IF NOT EXISTS idx_admin_users_status ON admin_users (employment_status);

-- ---------------------------------------------------------------------------
-- Enforcement tests (immutable / WORM for UPDATE + DELETE)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tests (
  id TEXT PRIMARY KEY,
  officer_id BIGINT,
  officer_name TEXT NOT NULL,
  badge_number TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  driver_id TEXT NOT NULL,
  driver_dob TEXT,
  bac_reading DOUBLE PRECISION NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass', 'fail')),
  location TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  original_test_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_tests_created_at ON tests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tests_officer_id ON tests (officer_id);
CREATE INDEX IF NOT EXISTS idx_tests_result ON tests (result);

CREATE OR REPLACE FUNCTION prevent_tests_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'tests records are immutable (WORM): % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_tests_no_update ON tests;
CREATE TRIGGER trg_tests_no_update
  BEFORE UPDATE ON tests
  FOR EACH ROW
  EXECUTE PROCEDURE prevent_tests_mutation();

DROP TRIGGER IF EXISTS trg_tests_no_delete ON tests;
CREATE TRIGGER trg_tests_no_delete
  BEFORE DELETE ON tests
  FOR EACH ROW
  EXECUTE PROCEDURE prevent_tests_mutation();

-- ---------------------------------------------------------------------------
-- Invalid invalidations (cancel-style action; does not edit the test row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invalidations (
  id BIGSERIAL PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES tests (id),
  reason TEXT NOT NULL,
  invalidated_by BIGINT REFERENCES officer_users (officer_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (test_id)
);

CREATE INDEX IF NOT EXISTS idx_invalidations_test_id ON invalidations (test_id);

-- ---------------------------------------------------------------------------
-- System settings (admin config display)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value)
VALUES
  ('mfa_policy', 'Required for all portal users'),
  ('session_timeout_minutes', '30'),
  ('password_min_length', '8')
ON CONFLICT (key) DO NOTHING;
