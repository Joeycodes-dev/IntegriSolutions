-- Separate immutable register for non-BAC roadside offences.
CREATE TABLE IF NOT EXISTS road_offences (
  id TEXT PRIMARY KEY,
  officer_id BIGINT NOT NULL REFERENCES officer_users (officer_id),
  officer_name TEXT NOT NULL,
  badge_number TEXT NOT NULL,
  offence_type TEXT NOT NULL CHECK (offence_type IN (
    'driving_without_valid_licence',
    'expired_driving_licence',
    'expired_vehicle_licence_disc',
    'vehicle_not_roadworthy',
    'defective_lights',
    'unsafe_tyres',
    'no_seat_belt',
    'mobile_phone_use',
    'speeding',
    'traffic_control_non_compliance',
    'reckless_or_negligent_driving',
    'unsafe_overtaking',
    'overloading',
    'registration_or_number_plate_non_compliance',
    'other'
  )),
  driver_name TEXT NOT NULL DEFAULT '',
  driver_identifier TEXT NOT NULL DEFAULT '',
  vehicle_registration TEXT NOT NULL DEFAULT '',
  vehicle_description TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL,
  action_taken TEXT NOT NULL CHECK (action_taken IN ('warning', 'fine_or_notice', 'vehicle_discontinued', 'referred', 'arrested', 'other')),
  reference_number TEXT,
  location JSONB NOT NULL,
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_road_offences_created_at ON road_offences (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_road_offences_officer_id ON road_offences (officer_id);
CREATE INDEX IF NOT EXISTS idx_road_offences_offence_type ON road_offences (offence_type);

CREATE OR REPLACE FUNCTION prevent_road_offences_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'road_offences records are immutable (WORM): % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_road_offences_no_update ON road_offences;
CREATE TRIGGER trg_road_offences_no_update
  BEFORE UPDATE ON road_offences
  FOR EACH ROW
  EXECUTE PROCEDURE prevent_road_offences_mutation();

DROP TRIGGER IF EXISTS trg_road_offences_no_delete ON road_offences;
CREATE TRIGGER trg_road_offences_no_delete
  BEFORE DELETE ON road_offences
  FOR EACH ROW
  EXECUTE PROCEDURE prevent_road_offences_mutation();

CREATE TABLE IF NOT EXISTS road_offence_reviews (
  id BIGSERIAL PRIMARY KEY,
  road_offence_id TEXT NOT NULL REFERENCES road_offences (id),
  reviewer_source TEXT NOT NULL CHECK (reviewer_source IN ('supervisor_users', 'admin_users')),
  reviewer_id BIGINT NOT NULL,
  reviewer_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('verified', 'correction_requested', 'referred', 'closed')),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_road_offence_reviews_offence_id ON road_offence_reviews (road_offence_id, created_at DESC);

CREATE TABLE IF NOT EXISTS road_offence_evidence (
  id BIGSERIAL PRIMARY KEY,
  road_offence_id TEXT NOT NULL REFERENCES road_offences (id),
  storage_path TEXT NOT NULL UNIQUE,
  storage_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by BIGINT NOT NULL REFERENCES officer_users (officer_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_road_offence_evidence_offence_id ON road_offence_evidence (road_offence_id, created_at DESC);