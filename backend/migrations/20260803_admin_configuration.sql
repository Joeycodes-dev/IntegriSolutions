-- Editable admin configuration.
-- Converts the display-only system_settings table into a typed, editable
-- registry with revision-based optimistic concurrency.
-- Replaces legacy display-only keys with the current settings registry.

-- Bootstrap this table when an environment has not yet run the core schema.
-- The statement is idempotent when 20260729_core_schema.sql already created it.
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track who last changed each setting.
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- Seed the editable settings registry with current-behaviour defaults.
INSERT INTO system_settings (key, value, updated_at) VALUES
  ('auth.session_timeout_minutes', '30', NOW()),
  ('export.pdf_watermark_enabled', 'true', NOW()),
  ('export.pdf_watermark_text', 'IntegriScan Court Evidence', NOW()),
  ('export.pdf_access', 'admin_supervisor', NOW()),
  ('alerts.integrity_flag_count', '1', NOW()),
  ('alerts.failure_rate_change_points', '1', NOW()),
  ('alerts.roadblock_minimum_tests', '3', NOW()),
  ('alerts.avg_failing_bac_multiple', '2', NOW()),
  ('bac.general.limit_g100ml', '0.05', NOW()),
  ('bac.general.limit_mg1000ml', '0.24', NOW()),
  ('bac.professional.limit_g100ml', '0.02', NOW()),
  ('bac.professional.limit_mg1000ml', '0.10', NOW()),
  ('system.config_revision', '1', NOW())
ON CONFLICT (key) DO NOTHING;

-- Remove legacy display-only keys that have no editable consumer.
DELETE FROM system_settings
WHERE key IN ('mfa_policy', 'session_timeout_minutes', 'password_min_length');
