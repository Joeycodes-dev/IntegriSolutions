-- Evidence bundle categories for mobile-first evidence capture.
-- Adds the category column to the evidence table so each photo is labelled
-- (licence_front, breathalyser_screen, vehicle, scene_note, signature_witness).

ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_evidence_category ON evidence (category);

UPDATE evidence SET category = 'vehicle' WHERE category IS NULL;
