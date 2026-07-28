-- Evidence photos, case annotations, and admin audit trail.
-- Run once in the Supabase SQL Editor (Dashboard → SQL → New query).

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_email ON audit_logs (actor_email);

-- ---------------------------------------------------------------------------
-- annotations (supervisor Evidence Review)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- evidence (photo uploads)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence (
  id BIGSERIAL PRIMARY KEY,
  test_id TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  notes TEXT,
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_test_id ON evidence (test_id);
CREATE INDEX IF NOT EXISTS idx_evidence_created_at ON evidence (created_at DESC);

-- ---------------------------------------------------------------------------
-- Storage bucket for evidence photos (public read for supervisor PDF/UI)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence', 'evidence', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Allow authenticated uploads via the service role / backend; public read for URLs.
DROP POLICY IF EXISTS "Public read evidence objects" ON storage.objects;
CREATE POLICY "Public read evidence objects"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'evidence');

DROP POLICY IF EXISTS "Service role manage evidence objects" ON storage.objects;
CREATE POLICY "Service role manage evidence objects"
  ON storage.objects FOR ALL
  USING (bucket_id = 'evidence')
  WITH CHECK (bucket_id = 'evidence');
