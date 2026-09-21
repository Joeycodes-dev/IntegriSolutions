-- Operational alerts (BOLO / hazard / general operational bulletins).
-- Run once in the Supabase SQL Editor, after 20260731_shift_roadblock_operations.sql
-- (target_shift_id references roadblock_shifts) and after the core officer_users table.

CREATE TABLE IF NOT EXISTS operational_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('bolo_person', 'bolo_vehicle', 'hazard', 'general')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  description TEXT NOT NULL,

  vehicle_registration TEXT,
  vehicle_description TEXT,
  person_name TEXT,
  person_description TEXT,
  -- Non-sensitive reference only (partial plate, alias, case ref) — never a full ID number.
  person_reference TEXT,

  photo_url TEXT,
  photo_storage_path TEXT,

  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  location_label TEXT,

  -- Only Supervisor accounts may issue alerts (see requireSupervisorRole in routes/supervisor/alerts.ts).
  issued_by_source TEXT NOT NULL DEFAULT 'supervisor_users'
    CHECK (issued_by_source = 'supervisor_users'),
  issued_by_id BIGINT NOT NULL,
  issued_by_name TEXT NOT NULL,

  target_scope TEXT NOT NULL
    CHECK (target_scope IN ('all_officers', 'shift', 'officers')),

  -- roadblock_shifts.id is TEXT in the existing schema, so this must also be TEXT.
  target_shift_id TEXT REFERENCES roadblock_shifts (id),

  -- Provenance: distinguishes internally-originated operational alerts from those
  -- relaying an external authority's circulation (SAPS, provincial traffic, etc.).
  source_type TEXT NOT NULL DEFAULT 'internal'
    CHECK (source_type IN ('internal', 'external')),
  source_authority TEXT,
  source_reference TEXT,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'cancelled', 'resolved')),
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_external_source_requires_authority CHECK (
    source_type = 'internal'
    OR (
      source_authority IS NOT NULL
      AND btrim(source_authority) <> ''
      AND source_reference IS NOT NULL
      AND btrim(source_reference) <> ''
    )
  ),

  -- A BOLO for a person or vehicle must trace to an external authority/system of record.
  CONSTRAINT chk_bolo_requires_external_source CHECK (
    alert_type NOT IN ('bolo_person', 'bolo_vehicle')
    OR source_type = 'external'
  )
);

CREATE INDEX IF NOT EXISTS idx_operational_alerts_status
  ON operational_alerts (status);

CREATE INDEX IF NOT EXISTS idx_operational_alerts_created_at
  ON operational_alerts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_alerts_target_shift
  ON operational_alerts (target_shift_id);

-- ---------------------------------------------------------------------------
-- Selected-officer targeting.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operational_alert_officers (
  alert_id UUID NOT NULL
    REFERENCES operational_alerts (id)
    ON DELETE CASCADE,

  officer_id BIGINT NOT NULL
    REFERENCES officer_users (officer_id),

  PRIMARY KEY (alert_id, officer_id)
);

CREATE INDEX IF NOT EXISTS idx_operational_alert_officers_officer
  ON operational_alert_officers (officer_id);

-- ---------------------------------------------------------------------------
-- Per-officer acknowledgements.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operational_alert_acknowledgements (
  alert_id UUID NOT NULL
    REFERENCES operational_alerts (id)
    ON DELETE CASCADE,

  officer_id BIGINT NOT NULL
    REFERENCES officer_users (officer_id),

  officer_name TEXT NOT NULL,
  badge_number TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (alert_id, officer_id)
);

-- ---------------------------------------------------------------------------
-- Possible-match reports.
-- Deliberately has NO status/confirmation column:
-- this is an escalation signal only, never a legal determination.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operational_alert_matches (
  id BIGSERIAL PRIMARY KEY,

  alert_id UUID NOT NULL
    REFERENCES operational_alerts (id)
    ON DELETE CASCADE,

  officer_id BIGINT NOT NULL
    REFERENCES officer_users (officer_id),

  officer_name TEXT NOT NULL,
  badge_number TEXT NOT NULL,
  notes TEXT NOT NULL,

  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operational_alert_matches_alert
  ON operational_alert_matches (alert_id);