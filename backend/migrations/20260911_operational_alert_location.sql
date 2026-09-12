-- Location extension for Operational Alerts: optional geo-trigger radius on
-- alerts, plus range validation for coordinates already present on both
-- operational_alerts and operational_alert_matches.
--
-- This does NOT introduce officer location tracking. operational_alerts'
-- coordinates are supervisor-authored (where the alert applies); operational_
-- alert_matches' coordinates are a single point an officer chose to attach to
-- one specific possible-match report — not a continuous location feed. No new
-- table is added here on purpose: operational_alert_matches already carries
-- lat/lng, timestamp (created_at), reporting officer, and the linked alert.

-- ---------------------------------------------------------------------------
-- operational_alerts: optional trigger radius for location-aware alerts.
-- ---------------------------------------------------------------------------
ALTER TABLE operational_alerts
  ADD COLUMN IF NOT EXISTS location_radius_meters INTEGER;

ALTER TABLE operational_alerts
  ADD CONSTRAINT chk_operational_alerts_location_lat
    CHECK (location_lat IS NULL OR (location_lat >= -90 AND location_lat <= 90));

ALTER TABLE operational_alerts
  ADD CONSTRAINT chk_operational_alerts_location_lng
    CHECK (location_lng IS NULL OR (location_lng >= -180 AND location_lng <= 180));

-- Sensible maximum: 50km covers any realistic roadblock/precinct trigger zone
-- without allowing an effectively-unbounded "radius" that defeats the point
-- of location targeting.
ALTER TABLE operational_alerts
  ADD CONSTRAINT chk_operational_alerts_location_radius
    CHECK (location_radius_meters IS NULL OR (location_radius_meters > 0 AND location_radius_meters <= 50000));

CREATE INDEX IF NOT EXISTS idx_operational_alerts_location
  ON operational_alerts (location_lat, location_lng)
  WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;

-- ---------------------------------------------------------------------------
-- operational_alert_matches: same coordinate range validation. No new
-- columns — lat/lng/created_at/officer/alert_id already exist and are
-- exactly what a "reported sighting" needs.
-- ---------------------------------------------------------------------------
ALTER TABLE operational_alert_matches
  ADD CONSTRAINT chk_operational_alert_matches_location_lat
    CHECK (location_lat IS NULL OR (location_lat >= -90 AND location_lat <= 90));

ALTER TABLE operational_alert_matches
  ADD CONSTRAINT chk_operational_alert_matches_location_lng
    CHECK (location_lng IS NULL OR (location_lng >= -180 AND location_lng <= 180));

CREATE INDEX IF NOT EXISTS idx_operational_alert_matches_location
  ON operational_alert_matches (location_lat, location_lng)
  WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;
