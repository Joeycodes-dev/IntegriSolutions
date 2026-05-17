-- Run in Supabase SQL Editor to persist system configuration
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value) VALUES
  ('auth.mfa_policy', 'Required for Supervisor and Admin roles.'),
  ('auth.session_timeout', '30 minutes inactive.'),
  ('retention.evidence_days', '90 days.'),
  ('retention.audit_days', '365 days.'),
  ('export.pdf_watermark', 'Enabled.'),
  ('export.excel_access', 'Admin only.'),
  ('environment.mode', 'IntegriScan'),
  ('environment.region', 'ZA-JHB-01')
ON CONFLICT (key) DO NOTHING;
